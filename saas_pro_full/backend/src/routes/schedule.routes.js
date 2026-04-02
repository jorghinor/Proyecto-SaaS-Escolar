const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, course_id, teacher_id, day_of_week, academic_year, classroom } = req.query;
        const offset = (page - 1) * limit;
        const schoolId = req.user.school_id;
        
        let query = `
            SELECT s.*, c.name as course_name, t.subject as teacher_subject, u.name as teacher_name
            FROM schedules s
            LEFT JOIN courses c ON s.course_id = c.id
            LEFT JOIN teachers t ON s.teacher_id = t.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE s.school_id = $1
        `;
        let countQuery = 'SELECT COUNT(*) FROM schedules WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 1;
        
        if (course_id) { paramCount++; query += ` AND s.course_id = $${paramCount}`; countQuery += ` AND course_id = $${paramCount}`; params.push(course_id); }
        if (teacher_id) { paramCount++; query += ` AND s.teacher_id = $${paramCount}`; countQuery += ` AND teacher_id = $${paramCount}`; params.push(teacher_id); }
        if (day_of_week) { paramCount++; query += ` AND s.day_of_week = $${paramCount}`; countQuery += ` AND day_of_week = $${paramCount}`; params.push(day_of_week); }
        if (academic_year) { paramCount++; query += ` AND s.academic_year = $${paramCount}`; countQuery += ` AND academic_year = $${paramCount}`; params.push(academic_year); }
        if (classroom) { paramCount++; query += ` AND s.classroom ILIKE $${paramCount}`; countQuery += ` AND classroom ILIKE $${paramCount}`; params.push(`%${classroom}%`); }
        
        query += ` ORDER BY s.day_of_week, s.start_time LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);
        
        const { rows } = await db.query(query, params);
        const countResult = await db.query(countQuery, params.slice(0, -2));
        res.json({ data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT s.*, c.name as course_name, u.name as teacher_name
            FROM schedules s
            LEFT JOIN courses c ON s.course_id = c.id
            LEFT JOIN teachers t ON s.teacher_id = t.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE s.id = $1 AND s.school_id = $2
        `, [req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
    try {
        const { course_id, teacher_id, day_of_week, start_time, end_time, classroom, academic_year } = req.body;
        const schoolId = req.user.school_id;
        
        const { rows } = await db.query(`
            INSERT INTO schedules (school_id, course_id, teacher_id, day_of_week, start_time, end_time, classroom, academic_year)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
        `, [schoolId, course_id, teacher_id, day_of_week, start_time, end_time, classroom, academic_year]);
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
    try {
        const { course_id, teacher_id, day_of_week, start_time, end_time, classroom, is_active } = req.body;
        const { rows } = await db.query(`
            UPDATE schedules SET course_id = COALESCE($1, course_id), teacher_id = COALESCE($2, teacher_id), day_of_week = COALESCE($3, day_of_week),
            start_time = COALESCE($4, start_time), end_time = COALESCE($5, end_time), classroom = COALESCE($6, classroom), is_active = COALESCE($7, is_active), updated_at = CURRENT_TIMESTAMP
            WHERE id = $8 AND school_id = $9 RETURNING *
        `, [course_id, teacher_id, day_of_week, start_time, end_time, classroom, is_active, req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query('DELETE FROM schedules WHERE id = $1 AND school_id = $2 RETURNING id', [req.params.id, req.user.school_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Schedule not found' });
        res.json({ message: 'Schedule deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
