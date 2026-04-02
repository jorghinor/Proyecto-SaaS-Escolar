const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', category, priority, target_audience, is_pinned } = req.query;
        const offset = (page - 1) * limit;
        const schoolId = req.user.school_id;
        
        let query = `
            SELECT a.*, u.name as created_by_name
            FROM announcements a
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.school_id = $1
        `;
        let countQuery = 'SELECT COUNT(*) FROM announcements WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 1;
        
        if (search) { paramCount++; query += ` AND (a.title ILIKE $${paramCount} OR a.content ILIKE $${paramCount})`; countQuery += ` AND (title ILIKE $${paramCount} OR content ILIKE $${paramCount})`; params.push(`%${search}%`); }
        if (category) { paramCount++; query += ` AND a.category = $${paramCount}`; countQuery += ` AND category = $${paramCount}`; params.push(category); }
        if (priority) { paramCount++; query += ` AND a.priority = $${paramCount}`; countQuery += ` AND priority = $${paramCount}`; params.push(priority); }
        if (target_audience) { paramCount++; query += ` AND a.target_audience = $${paramCount}`; countQuery += ` AND target_audience = $${paramCount}`; params.push(target_audience); }
        if (is_pinned !== undefined) { paramCount++; query += ` AND a.is_pinned = $${paramCount}`; countQuery += ` AND is_pinned = $${paramCount}`; params.push(is_pinned === 'true'); }
        
        query += ` ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);
        
        const { rows } = await db.query(query, params);
        const countResult = await db.query(countQuery, params.slice(0, -2));
        res.json({ data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT a.*, u.name as created_by_name
            FROM announcements a
            LEFT JOIN users u ON a.created_by = u.id
            WHERE a.id = $1 AND a.school_id = $2
        `, [req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
        
        // Increment views
        await db.query('UPDATE announcements SET views_count = views_count + 1 WHERE id = $1', [req.params.id]);
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
    try {
        const { title, content, category, priority, target_audience, expires_at, is_pinned } = req.body;
        const schoolId = req.user.school_id;
        const createdBy = req.user.id;
        
        const { rows } = await db.query(`
            INSERT INTO announcements (school_id, title, content, category, priority, target_audience, expires_at, is_pinned, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
        `, [schoolId, title, content, category, priority, target_audience, expires_at, is_pinned, createdBy]);
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
    try {
        const { title, content, category, priority, target_audience, expires_at, is_pinned, is_active } = req.body;
        const { rows } = await db.query(`
            UPDATE announcements SET title = COALESCE($1, title), content = COALESCE($2, content), category = COALESCE($3, category),
            priority = COALESCE($4, priority), target_audience = COALESCE($5, target_audience),
            expires_at = COALESCE($6, expires_at), is_pinned = COALESCE($7, is_pinned), is_active = COALESCE($8, is_active), updated_at = CURRENT_TIMESTAMP
            WHERE id = $9 AND school_id = $10 RETURNING *
        `, [title, content, category, priority, target_audience, expires_at, is_pinned, is_active, req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query('DELETE FROM announcements WHERE id = $1 AND school_id = $2 RETURNING id', [req.params.id, req.user.school_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Announcement not found' });
        res.json({ message: 'Announcement deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
