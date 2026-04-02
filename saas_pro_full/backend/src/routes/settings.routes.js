const router = require('express').Router();
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

// Obtener configuración
router.get('/', auth, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM school_settings WHERE school_id = $1',
            [req.user.school_id]
        );
        if (rows.length === 0) {
            // Crear configuración por defecto
            const { rows: newSettings } = await db.query(
                'INSERT INTO school_settings (school_id) VALUES ($1) RETURNING *',
                [req.user.school_id]
            );
            return res.json(newSettings[0]);
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar configuración
router.put('/', [auth, authorize(['admin'])], async (req, res) => {
    const { grade_scale, currency, academic_year } = req.body;
    try {
        const { rows } = await db.query(
            `UPDATE school_settings 
             SET grade_scale = $1, currency = $2, academic_year = $3, updated_at = CURRENT_TIMESTAMP 
             WHERE school_id = $4 RETURNING *`,
            [grade_scale, currency, academic_year, req.user.school_id]
        );
        if (rows.length === 0) {
            // Crear si no existe
            const { rows: newSettings } = await db.query(
                'INSERT INTO school_settings (school_id, grade_scale, currency, academic_year) VALUES ($1, $2, $3, $4) RETURNING *',
                [req.user.school_id, grade_scale, currency, academic_year]
            );
            return res.json(newSettings[0]);
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
