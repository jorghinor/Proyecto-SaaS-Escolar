const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

router.get('/', auth, async (req, res) => {
    try {
        const { page = 1, limit = 10, student_id, document_type, is_verified } = req.query;
        const offset = (page - 1) * limit;
        const schoolId = req.user.school_id;
        
        let query = `
            SELECT d.*, s.name as student_name, u.name as verified_by_name
            FROM documents d
            JOIN students s ON d.student_id = s.id
            LEFT JOIN users u ON d.verified_by = u.id
            WHERE d.school_id = $1
        `;
        let countQuery = 'SELECT COUNT(*) FROM documents WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 1;
        
        if (student_id) { paramCount++; query += ` AND d.student_id = $${paramCount}`; countQuery += ` AND student_id = $${paramCount}`; params.push(student_id); }
        if (document_type) { paramCount++; query += ` AND d.document_type = $${paramCount}`; countQuery += ` AND document_type = $${paramCount}`; params.push(document_type); }
        if (is_verified !== undefined) { paramCount++; query += ` AND d.is_verified = $${paramCount}`; countQuery += ` AND is_verified = $${paramCount}`; params.push(is_verified === 'true'); }
        
        query += ` ORDER BY d.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);
        
        const { rows } = await db.query(query, params);
        const countResult = await db.query(countQuery, params.slice(0, -2));
        res.json({ data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: parseInt(countResult.rows[0].count), totalPages: Math.ceil(parseInt(countResult.rows[0].count) / limit) }});
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT d.*, s.name as student_name, u.name as verified_by_name
            FROM documents d
            JOIN students s ON d.student_id = s.id
            LEFT JOIN users u ON d.verified_by = u.id
            WHERE d.id = $1 AND d.school_id = $2
        `, [req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, async (req, res) => {
    try {
        const { student_id, document_type, name, file_url, description } = req.body;
        const schoolId = req.user.school_id;
        
        const { rows } = await db.query(`
            INSERT INTO documents (school_id, student_id, document_type, name, file_url, description)
            VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
        `, [schoolId, student_id, document_type, name, file_url, description]);
        res.status(201).json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, async (req, res) => {
    try {
        const { document_type, name, description, is_verified } = req.body;
        const verifiedBy = is_verified ? req.user.id : null;
        const verifiedAt = is_verified ? new Date() : null;
        
        const { rows } = await db.query(`
            UPDATE documents SET document_type = COALESCE($1, document_type), name = COALESCE($2, name),
            description = COALESCE($3, description), is_verified = COALESCE($4, is_verified), verified_by = COALESCE($5, verified_by), verified_at = COALESCE($6, verified_at)
            WHERE id = $7 AND school_id = $8 RETURNING *
        `, [document_type, name, description, is_verified, verifiedBy, verifiedAt, req.params.id, req.user.school_id]);
        if (rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        res.json(rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query('DELETE FROM documents WHERE id = $1 AND school_id = $2 RETURNING id', [req.params.id, req.user.school_id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
        res.json({ message: 'Document deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
