const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

// GET /academic-periods - Get all academic periods
router.get('/', auth, async (req, res) => {
    try {
        const { year, is_active } = req.query;
        const schoolId = req.user.school_id;
        
        let query = 'SELECT * FROM academic_periods WHERE school_id = $1';
        const params = [schoolId];
        let paramCount = 1;
        
        if (year) {
            query += ` AND year = $${++paramCount}`;
            params.push(year);
        }
        
        if (is_active !== undefined) {
            query += ` AND is_active = $${++paramCount}`;
            params.push(is_active === 'true');
        }
        
        query += ' ORDER BY start_date DESC';
        
        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error('Error fetching academic periods:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /academic-periods/:id - Get single period
router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM academic_periods WHERE id = $1 AND school_id = $2',
            [req.params.id, req.user.school_id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Academic period not found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching academic period:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /academic-periods - Create new period
router.post('/', auth, async (req, res) => {
    try {
        const { name, start_date, end_date, year } = req.body;
        const schoolId = req.user.school_id;
        
        const { rows } = await db.query(`
            INSERT INTO academic_periods (school_id, name, start_date, end_date, year)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [schoolId, name, start_date, end_date, year]);
        
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error creating academic period:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /academic-periods/:id - Update period
router.put('/:id', auth, async (req, res) => {
    try {
        const { name, start_date, end_date, year, is_active } = req.body;
        const schoolId = req.user.school_id;
        
        const { rows } = await db.query(`
            UPDATE academic_periods 
            SET name = COALESCE($1, name),
                start_date = COALESCE($2, start_date),
                end_date = COALESCE($3, end_date),
                year = COALESCE($4, year),
                is_active = COALESCE($5, is_active)
            WHERE id = $6 AND school_id = $7
            RETURNING *
        `, [name, start_date, end_date, year, is_active, req.params.id, schoolId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Academic period not found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating academic period:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /academic-periods/:id - Delete period
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM academic_periods WHERE id = $1 AND school_id = $2 RETURNING id',
            [req.params.id, req.user.school_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Academic period not found' });
        }
        
        res.json({ message: 'Academic period deleted successfully' });
    } catch (err) {
        console.error('Error deleting academic period:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /academic-periods/create-defaults - Crear períodos por defecto
router.post('/create-defaults', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const currentYear = new Date().getFullYear();
        const prevYear = currentYear - 1;
        
        // Verificar si ya existen períodos
        const { rows: existing } = await db.query(
            'SELECT COUNT(*) FROM academic_periods WHERE school_id = $1',
            [schoolId]
        );
        
        if (parseInt(existing[0].count) > 0) {
            return res.status(400).json({ 
                error: 'Ya existen períodos académicos para este colegio',
                count: existing[0].count 
            });
        }
        
        // Insertar trimestres para el año actual y anterior
        const periods = [
            { name: 'Primer Trimestre', start: `${prevYear}-01-15`, end: `${prevYear}-04-15`, year: prevYear },
            { name: 'Segundo Trimestre', start: `${prevYear}-04-16`, end: `${prevYear}-07-15`, year: prevYear },
            { name: 'Tercer Trimestre', start: `${prevYear}-07-16`, end: `${prevYear}-11-15`, year: prevYear },
            { name: 'Primer Trimestre', start: `${currentYear}-01-15`, end: `${currentYear}-04-15`, year: currentYear },
            { name: 'Segundo Trimestre', start: `${currentYear}-04-16`, end: `${currentYear}-07-15`, year: currentYear },
            { name: 'Tercer Trimestre', start: `${currentYear}-07-16`, end: `${currentYear}-11-15`, year: currentYear },
        ];
        
        const inserted = [];
        for (const period of periods) {
            const { rows } = await db.query(`
                INSERT INTO academic_periods (school_id, name, start_date, end_date, year, is_active)
                VALUES ($1, $2, $3, $4, $5, true)
                RETURNING *
            `, [schoolId, period.name, period.start, period.end, period.year]);
            inserted.push(rows[0]);
        }
        
        res.json({
            success: true,
            message: `Se crearon ${inserted.length} períodos académicos exitosamente`,
            data: inserted
        });
    } catch (err) {
        console.error('Error creating default periods:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
