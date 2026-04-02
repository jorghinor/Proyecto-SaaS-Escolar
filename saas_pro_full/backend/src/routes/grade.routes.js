const router = require('express').Router();
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

router.get('/', auth, async (req, res) => {
    try {
        let query = 'SELECT * FROM grades WHERE school_id = $1';
        let params = [req.user.school_id];

        // Padres solo ven notas de sus hijos (simplificado: asumiendo email)
        if (req.user.role === 'parent') {
            query = `
                SELECT g.*
                FROM grades g
                JOIN students s ON g.student_id = s.id
                WHERE s.parent_email = $1 AND g.school_id = $2
            `;
            // Necesitamos buscar el email del usuario actual para filtrar
            const user = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
            params = [user.rows[0].email, req.user.school_id];
        }

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', [auth, authorize(['teacher', 'admin'])], async (req, res) => {
    const { student_id, subject, score } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO grades (student_id, subject, score, school_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [student_id, subject, score, req.user.school_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', [auth, authorize(['teacher', 'admin'])], async (req, res) => {
    const { id } = req.params;
    const { student_id, subject, score } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE grades SET student_id = $1, subject = $2, score = $3 WHERE id = $4 AND school_id = $5 RETURNING *',
            [student_id, subject, score, id, req.user.school_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Grade not found or access denied' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', [auth, authorize(['teacher', 'admin'])], async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await db.query(
            'DELETE FROM grades WHERE id = $1 AND school_id = $2',
            [id, req.user.school_id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Grade not found or access denied' });
        res.json({ message: 'Grade deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;