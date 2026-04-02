const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

// GET /enrollments - Get all enrollments with pagination, search and filters
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', student_id, school_id, academic_year, status, grade } = req.query;
        const offset = (page - 1) * limit;
        const userSchoolId = req.user.school_id;
        
        let query = `
            SELECT e.*, s.name as student_name, s.parent_email, sch.name as school_name
            FROM enrollments e
            JOIN students s ON e.student_id = s.id
            LEFT JOIN schools sch ON e.school_id = sch.id
            WHERE e.school_id = $1
        `;
        let countQuery = 'SELECT COUNT(*) FROM enrollments WHERE school_id = $1';
        const params = [userSchoolId];
        let paramCount = 1;
        
        if (search) {
            paramCount++;
            query += ` AND s.name ILIKE $${paramCount}`;
            countQuery += ` AND student_id IN (SELECT id FROM students WHERE name ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }
        if (student_id) { paramCount++; query += ` AND e.student_id = $${paramCount}`; countQuery += ` AND student_id = $${paramCount}`; params.push(student_id); }
        if (academic_year) { paramCount++; query += ` AND e.academic_year = $${paramCount}`; countQuery += ` AND academic_year = $${paramCount}`; params.push(academic_year); }
        if (status) { paramCount++; query += ` AND e.status = $${paramCount}`; countQuery += ` AND status = $${paramCount}`; params.push(status); }
        if (grade) { paramCount++; query += ` AND e.grade = $${paramCount}`; countQuery += ` AND grade = $${paramCount}`; params.push(grade); }
        
        query += ` ORDER BY e.enrollment_date DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);
        
        const { rows } = await db.query(query, params);
        const countResult = await db.query(countQuery, params.slice(0, -2));
        
        res.json({ data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT e.*, s.name as student_name, sch.name as school_name
            FROM enrollments e
            JOIN students s ON e.student_id = s.id
            LEFT JOIN schools sch ON e.school_id = sch.id
            WHERE e.id = $1 AND e.school_id = $2
        `, [req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Enrollment not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
    try {
        const { student_id, academic_year, grade, section, tuition_fee, notes } = req.body;
        const schoolId = req.user.school_id;
        
        const { rows } = await db.query(`
            INSERT INTO enrollments (student_id, school_id, academic_year, grade, section, tuition_fee, notes, enrollment_date)
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE) RETURNING *
        `, [student_id, schoolId, academic_year, grade, section, tuition_fee, notes]);
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
    try {
        const { grade, section, status, tuition_fee, payment_status, observations } = req.body;
        const { rows } = await db.query(`
            UPDATE enrollments SET grade = COALESCE($1, grade), section = COALESCE($2, section), status = COALESCE($3, status),
            tuition_fee = COALESCE($4, tuition_fee), payment_status = COALESCE($5, payment_status), observations = COALESCE($6, observations), updated_at = CURRENT_TIMESTAMP
            WHERE id = $7 AND school_id = $8 RETURNING *
        `, [grade, section, status, tuition_fee, payment_status, observations, req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Enrollment not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query('DELETE FROM enrollments WHERE id = $1 AND school_id = $2 RETURNING id', [req.params.id, req.user.school_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Enrollment not found' });
        res.json({ message: 'Enrollment deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
