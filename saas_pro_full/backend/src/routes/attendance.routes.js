const router = require('express').Router();
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

router.get('/', auth, async (req, res) => {
    try {
        let query = 'SELECT * FROM attendance WHERE school_id = $1';
        let params = [req.user.school_id];

        if (req.user.role === 'parent') {
            const user = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
            query = `
                SELECT a.*
                FROM attendance a
                JOIN students s ON a.student_id = s.id
                WHERE s.parent_email = $1 AND a.school_id = $2
            `;
            params = [user.rows[0].email, req.user.school_id];
        }

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/', [auth, authorize(['teacher', 'admin'])], async (req, res) => {
    const { student_id, date, status } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO attendance (student_id, date, status, school_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [student_id, date, status, req.user.school_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/:id', [auth, authorize(['teacher', 'admin'])], async (req, res) => {
    const { id } = req.params;
    const { student_id, date, status } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE attendance SET student_id = $1, date = $2, status = $3 WHERE id = $4 AND school_id = $5 RETURNING *',
            [student_id, date, status, id, req.user.school_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Attendance not found or access denied' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', [auth, authorize(['teacher', 'admin'])], async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await db.query(
            'DELETE FROM attendance WHERE id = $1 AND school_id = $2',
            [id, req.user.school_id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Attendance not found or access denied' });
        res.json({ message: 'Attendance deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;