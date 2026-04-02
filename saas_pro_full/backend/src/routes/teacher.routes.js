const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');
const bcrypt = require('bcrypt');

// GET /teachers - List all teachers with pagination, search, filters
router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, perPage = 10, search = '', subject = '', status = '' } = req.query;
        const offset = (page - 1) * perPage;
        
        let whereClause = 'WHERE u.role = $1 AND u.school_id = $2';
        const params = ['teacher', req.user.school_id];
        let paramIndex = 3;
        
        if (search) {
            whereClause += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (subject) {
            whereClause += ` AND t.subject = $${paramIndex}`;
            params.push(subject);
            paramIndex++;
        }
        
        if (status) {
            whereClause += ` AND t.status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }
        
        // Get total count
        const countQuery = `
            SELECT COUNT(*) 
            FROM users u 
            LEFT JOIN teachers t ON u.id = t.user_id 
            ${whereClause}
        `;
        const { rows: countRows } = await db.query(countQuery, params);
        const total = parseInt(countRows[0].count);
        
        // Get teachers with pagination
        const query = `
            SELECT t.id as teacher_id, u.id as user_id, u.name, u.email, u.created_at, u.last_login,
                   t.subject, t.phone, t.qualification, t.status, t.bio
            FROM users u
            LEFT JOIN teachers t ON u.id = t.user_id
            ${whereClause}
            ORDER BY u.name
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;
        params.push(perPage, offset);
        
        const { rows } = await db.query(query, params);
        
        res.json({
            data: rows,
            pagination: {
                page: parseInt(page),
                perPage: parseInt(perPage),
                total,
                totalPages: Math.ceil(total / perPage)
            }
        });
    } catch (err) {
        console.error('Error fetching teachers:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /teachers/:id - Get single teacher
router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT t.id as teacher_id, u.id as user_id, u.name, u.email, u.created_at, u.last_login,
                   t.subject, t.phone, t.qualification, t.status, t.bio
            FROM users u
            LEFT JOIN teachers t ON u.id = t.user_id
            WHERE u.id = $1 AND u.role = 'teacher' AND u.school_id = $2
        `, [req.params.id, req.user.school_id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Teacher not found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching teacher:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /teachers - Create new teacher
router.post('/', auth, async (req, res) => {
    try {
        const { name, email, password, subject, phone, qualification, bio } = req.body;
        
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password are required' });
        }
        
        // Check if email already exists
        const { rows: existing } = await db.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const { rows: userRows } = await db.query(
            `INSERT INTO users (name, email, password, role, school_id, created_at)
             VALUES ($1, $2, $3, 'teacher', $4, NOW())
             RETURNING id, name, email, role, created_at`,
            [name, email, hashedPassword, req.user.school_id]
        );
        
        const userId = userRows[0].id;
        
        // Create teacher profile
        const { rows: teacherRows } = await db.query(
            `INSERT INTO teachers (user_id, subject, phone, qualification, status, bio)
             VALUES ($1, $2, $3, $4, 'active', $5)
             RETURNING *`,
            [userId, subject || null, phone || null, qualification || null, bio || null]
        );
        
        res.status(201).json({
            ...userRows[0],
            ...teacherRows[0]
        });
    } catch (err) {
        console.error('Error creating teacher:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /teachers/:id - Update teacher
router.put('/:id', auth, async (req, res) => {
    try {
        const { name, email, subject, phone, qualification, status, bio } = req.body;
        
        // Check if teacher exists and belongs to school
        const { rows: existing } = await db.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2 AND school_id = $3',
            [req.params.id, 'teacher', req.user.school_id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Teacher not found' });
        }
        
        // Update user
        await db.query(
            'UPDATE users SET name = $1, email = $2 WHERE id = $3',
            [name, email, req.params.id]
        );
        
        // Check if teacher profile exists
        const { rows: profileRows } = await db.query(
            'SELECT * FROM teachers WHERE user_id = $1',
            [req.params.id]
        );
        
        if (profileRows.length > 0) {
            // Update existing profile
            await db.query(
                `UPDATE teachers 
                 SET subject = $1, phone = $2, qualification = $3, status = $4, bio = $5
                 WHERE user_id = $6`,
                [subject, phone, qualification, status, bio, req.params.id]
            );
        } else {
            // Create new profile
            await db.query(
                `INSERT INTO teachers (user_id, subject, phone, qualification, status, bio)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [req.params.id, subject, phone, qualification, status || 'active', bio]
            );
        }
        
        res.json({ message: 'Teacher updated successfully' });
    } catch (err) {
        console.error('Error updating teacher:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /teachers/:id - Delete teacher
router.delete('/:id', auth, async (req, res) => {
    try {
        // Check if teacher exists and belongs to school
        const { rows: existing } = await db.query(
            'SELECT * FROM users WHERE id = $1 AND role = $2 AND school_id = $3',
            [req.params.id, 'teacher', req.user.school_id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({ error: 'Teacher not found' });
        }
        
        // Delete teacher profile first (foreign key)
        await db.query('DELETE FROM teachers WHERE user_id = $1', [req.params.id]);
        
        // Delete user
        await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        
        res.json({ message: 'Teacher deleted successfully' });
    } catch (err) {
        console.error('Error deleting teacher:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /teachers/subjects/list - Get unique subjects for filter
router.get('/subjects/list', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT DISTINCT t.subject 
            FROM teachers t
            JOIN users u ON t.user_id = u.id
            WHERE u.school_id = $1 AND t.subject IS NOT NULL
            ORDER BY t.subject
        `, [req.user.school_id]);
        
        res.json(rows.map(r => r.subject));
    } catch (err) {
        console.error('Error fetching subjects:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
