const router = require('express').Router();
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

router.get('/stats', [auth, authorize(['admin', 'teacher'])], async (req, res) => {
    try {
        const school_id = req.user.school_id;

        // 1. Conteo General
        const studentsCount = await db.query('SELECT COUNT(*) FROM students WHERE school_id = $1', [school_id]);

        // 2. Data para Gráfica de Barras (Promedio de notas por materia)
        const gradesAvg = await db.query(`
            SELECT
                COALESCE(rcd.subject_name, 'Sin Materia') as subject,
                AVG(CAST(rcd.score AS NUMERIC)) as average
            FROM report_card_details rcd
            INNER JOIN report_cards rc ON rcd.report_card_id = rc.id
            INNER JOIN students s ON rc.student_id = s.id
            WHERE s.school_id = $1 AND rcd.subject_name IS NOT NULL AND rcd.subject_name != ''
            GROUP BY rcd.subject_name
        `, [school_id]);

        // 3. Data para Gráfica de Torta (Estado de Pagos)
        const paymentStats = await db.query(`
            SELECT status, COUNT(*) as count
            FROM payments
            WHERE school_id = $1
            GROUP BY status
        `, [school_id]);

        // 4. Asistencia
        const attendanceStats = await db.query(`
            SELECT status, COUNT(*) as count
            FROM attendance
            WHERE school_id = $1
            GROUP BY status
        `, [school_id]);

        res.json({
            total_students: studentsCount.rows[0].count,
            grades_avg: gradesAvg.rows,
            payments_distribution: paymentStats.rows,
            attendance_distribution: attendanceStats.rows
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Nueva ruta para obtener el listado detallado de materias y notas (para la tabla de edición)
router.get('/details-list', [auth, authorize(['admin', 'teacher'])], async (req, res) => {
    try {
        const school_id = req.user.school_id;
        const result = await db.query(`
            SELECT rcd.*, s.first_name, s.last_name
            FROM report_card_details rcd
            INNER JOIN report_cards rc ON rcd.report_card_id = rc.id
            INNER JOIN students s ON rc.student_id = s.id
            WHERE s.school_id = $1
            ORDER BY s.last_name ASC
        `, [school_id]);
        
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ruta para agregar una nueva calificación (El botón "Agregar" que ya tienes)
router.post('/add', [auth, authorize(['admin', 'teacher'])], async (req, res) => {
    try {
        const { report_card_id, subject_name, score, conduct, teacher_name, comments } = req.body;
        const result = await db.query(
            'INSERT INTO report_card_details (report_card_id, subject_name, score, conduct, teacher_name, comments) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [report_card_id, subject_name, score, conduct, teacher_name, comments]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Nueva ruta para actualizar una calificación o materia específica
router.put('/detail/:id', [auth, authorize(['admin', 'teacher'])], async (req, res) => {
    try {
        const { id } = req.params;
        const { subject_name, score, conduct, teacher_name, comments } = req.body;
        const school_id = req.user.school_id;

        // Actualizamos validando que el registro pertenece a la escuela del usuario
        const result = await db.query(
            `UPDATE report_card_details rcd
             SET subject_name = $1, score = $2, conduct = $3, teacher_name = $4, comments = $5
             FROM report_cards rc, students s
             WHERE rcd.report_card_id = rc.id AND rc.student_id = s.id 
             AND rcd.id = $6 AND s.school_id = $7
             RETURNING rcd.*`,
            [subject_name, score, conduct, teacher_name, comments, id, school_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'No se encontró el registro para actualizar o no tiene permisos.' });
        }

        res.json({ message: 'Actualizado correctamente', data: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;