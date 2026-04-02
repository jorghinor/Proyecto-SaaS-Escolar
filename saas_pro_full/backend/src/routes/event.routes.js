const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

// GET /events - Get all events
router.get('/', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const { rows } = await db.query(
            'SELECT * FROM events WHERE school_id = $1 AND is_active = true ORDER BY start_date ASC',
            [schoolId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching events:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /events - Create new event
router.post('/', auth, async (req, res) => {
    try {
        const {
            title, description, event_type, start_date, end_date,
            location, is_holiday, target_audience
        } = req.body;
        const schoolId = req.user.school_id;

        const { rows } = await db.query(`
            INSERT INTO events
            (title, description, event_type, start_date, end_date, location, is_holiday, target_audience, school_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `, [title, description, event_type, start_date, end_date || null, location, is_holiday || false, target_audience || 'all', schoolId]);

        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error creating event:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /events/:id - Update event
router.put('/:id', auth, async (req, res) => {
    try {
        const {
            title, description, event_type, start_date, end_date,
            location, is_holiday, target_audience
        } = req.body;
        const schoolId = req.user.school_id;

        // Primero verificar que el evento pertenezca al colegio
        const check = await db.query('SELECT id FROM events WHERE id = $1 AND school_id = $2', [req.params.id, schoolId]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Event not found' });

        const { rows } = await db.query(`
            UPDATE events
            SET title = COALESCE($1, title),
                description = COALESCE($2, description),
                event_type = COALESCE($3, event_type),
                start_date = COALESCE($4, start_date),
                end_date = COALESCE($5, end_date),
                location = COALESCE($6, location),
                is_holiday = COALESCE($7, is_holiday),
                target_audience = COALESCE($8, target_audience),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $9 AND school_id = $10
            RETURNING *
        `, [title, description, event_type, start_date, end_date, location, is_holiday, target_audience, req.params.id, schoolId]);

        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating event:', err);
        // Si el error es que la columna updated_at no existe, intentamos sin ella
        if (err.message.includes('column "updated_at" does not exist')) {
            try {
                const { rows } = await db.query(`
                    UPDATE events
                    SET title = COALESCE($1, title),
                        description = COALESCE($2, description),
                        event_type = COALESCE($3, event_type),
                        start_date = COALESCE($4, start_date),
                        end_date = COALESCE($5, end_date),
                        location = COALESCE($6, location),
                        is_holiday = COALESCE($7, is_holiday),
                        target_audience = COALESCE($8, target_audience)
                    WHERE id = $9 AND school_id = $10
                    RETURNING *
                `, [title, description, event_type, start_date, end_date, location, is_holiday, target_audience, req.params.id, schoolId]);
                return res.json(rows[0]);
            } catch (innerErr) {
                return res.status(500).json({ error: innerErr.message });
            }
        }
        res.status(500).json({ error: err.message });
    }
});

// DELETE /events/:id - Delete event
router.delete('/:id', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const result = await db.query('UPDATE events SET is_active = false WHERE id = $1 AND school_id = $2', [req.params.id, schoolId]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Event not found' });
        res.json({ message: 'Event deleted' });
    } catch (err) {
        console.error('Error deleting event:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;