const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');
const bcrypt = require('bcrypt');

router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', relationship, is_active } = req.query;
        const offset = (page - 1) * limit;
        const schoolId = req.user.school_id;
        
        // Modificado para incluir el nombre del estudiante mediante JOIN con la tabla students
        let query = `
            SELECT p.*, s.name as student_name
            FROM parents p
            LEFT JOIN students s ON p.student_id = s.id
            WHERE p.school_id = $1
        `;
        let countQuery = 'SELECT COUNT(*) FROM parents WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 1;
        
        if (search) {
            paramCount++;
            query += ` AND (p.first_name ILIKE $${paramCount} OR p.last_name ILIKE $${paramCount} OR p.email ILIKE $${paramCount} OR p.phone ILIKE $${paramCount} OR s.name ILIKE $${paramCount})`;
            countQuery += ` AND (first_name ILIKE $${paramCount} OR last_name ILIKE $${paramCount} OR email ILIKE $${paramCount} OR phone ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }
        
        if (relationship) {
            paramCount++;
            query += ` AND p.relationship = $${paramCount}`;
            countQuery += ` AND relationship = $${paramCount}`;
            params.push(relationship);
        }

        if (is_active !== undefined) {
            paramCount++;
            query += ` AND p.is_active = $${paramCount}`;
            countQuery += ` AND is_active = $${paramCount}`;
            params.push(is_active === 'true');
        }

        query += ` ORDER BY p.last_name, p.first_name LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);
        
        const { rows } = await db.query(query, params);
        const countResult = await db.query(countQuery, params.slice(0, -2));
        res.json({
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching parents:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/me/students', auth, async (req, res) => {
    if (req.user.role !== 'parent') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        // Now we can use user_id directly thanks to the new relationship
        const { rows } = await db.query(
            `
            SELECT
                s.id,
                s.name,
                s.grade,
                s.parent_email,
                e.id AS enrollment_id,
                e.academic_year,
                e.tuition_fee,
                e.payment_status
            FROM students s
            JOIN student_parents sp ON s.id = sp.student_id
            JOIN parents p ON sp.parent_id = p.id
            LEFT JOIN enrollments e
                ON e.student_id = s.id
                AND e.school_id = s.school_id
                AND e.academic_year = EXTRACT(YEAR FROM CURRENT_DATE)
            WHERE p.user_id = $1
            ORDER BY s.name
            `,
            [req.user.id]
        );

        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM parents WHERE id = $1 AND school_id = $2', [req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Parent not found' });
        
        // Get associated students
        const { rows: students } = await db.query(`
            SELECT s.id, s.name, s.grade, sp.is_primary, sp.can_pickup, sp.emergency_contact
            FROM student_parents sp
            JOIN students s ON sp.student_id = s.id
            WHERE sp.parent_id = $1
        `, [req.params.id]);
        
        res.json({ ...rows[0], students });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const { first_name, last_name, relationship, phone, email, address, occupation, student_id, password } = req.body;
        const schoolId = req.user.school_id;

        // 1. Create User first
        const salt = await bcrypt.genSalt(10);
        const defaultPassword = password || phone || 'Parent123!'; // Use provided password, phone, or default
        const hashPassword = await bcrypt.hash(defaultPassword, salt);
        
        const userResult = await client.query(
            'INSERT INTO users (name, email, password, role, school_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [`${first_name} ${last_name}`, email, hashPassword, 'parent', schoolId]
        );
        const userId = userResult.rows[0].id;

        // 2. Create Parent linked to user
        const { rows } = await client.query(`
            INSERT INTO parents (school_id, user_id, first_name, last_name, relationship, phone, email, address, occupation, student_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *
        `, [schoolId, userId, first_name, last_name, relationship, phone, email, address, occupation, student_id]);
        
        // 3. If student_id is provided, create the relationship in student_parents automatically
        if (student_id) {
            await client.query(`
                INSERT INTO student_parents (student_id, parent_id, is_primary)
                VALUES ($1, $2, $3)
                ON CONFLICT (student_id, parent_id) DO NOTHING
            `, [student_id, rows[0].id, true]);
        }

        await client.query('COMMIT');
        res.status(201).json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creating parent:', err);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

router.put('/:id', auth, async (req, res) => {
    try {
        const { first_name, last_name, relationship, phone, email, address, occupation, student_id, is_active } = req.body;
        const { rows } = await db.query(`
            UPDATE parents SET first_name = COALESCE($1, first_name), last_name = COALESCE($2, last_name), relationship = COALESCE($3, relationship),
            phone = COALESCE($4, phone), email = COALESCE($5, email), address = COALESCE($6, address), occupation = COALESCE($7, occupation),
            student_id = COALESCE($8, student_id), is_active = COALESCE($9, is_active)
            WHERE id = $10 AND school_id = $11 RETURNING *
        `, [first_name, last_name, relationship, phone, email, address, occupation, student_id, is_active, req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Parent not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query('DELETE FROM parents WHERE id = $1 AND school_id = $2 RETURNING id', [req.params.id, req.user.school_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Parent not found' });
        res.json({ message: 'Parent deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Link parent to student
router.post('/:id/link-student', auth, async (req, res) => {
    try {
        const { student_id, is_primary, can_pickup, emergency_contact } = req.body;
        const { rows } = await db.query(`
            INSERT INTO student_parents (parent_id, student_id, is_primary, can_pickup, emergency_contact)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [req.params.id, student_id, is_primary, can_pickup, emergency_contact]);
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
