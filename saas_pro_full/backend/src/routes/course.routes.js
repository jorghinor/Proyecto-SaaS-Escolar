const router = require('express').Router();
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

// Obtener todos los cursos
router.get('/', auth, async (req, res) => {
    try {
        const { rows } = await db.query(`
            SELECT c.*, u.name as teacher_name 
            FROM courses c 
            LEFT JOIN users u ON c.teacher_id = u.id 
            WHERE c.school_id = $1
            ORDER BY c.name
        `, [req.user.school_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Crear curso
router.post('/', [auth, authorize(['admin'])], async (req, res) => {
    const { name, description, teacher_id } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO courses (name, description, teacher_id, school_id) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, description, teacher_id, req.user.school_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Actualizar curso
router.put('/:id', [auth, authorize(['admin'])], async (req, res) => {
    const { id } = req.params;
    const { name, description, teacher_id } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE courses SET name = $1, description = $2, teacher_id = $3 WHERE id = $4 AND school_id = $5 RETURNING *',
            [name, description, teacher_id, id, req.user.school_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar curso
router.delete('/:id', [auth, authorize(['admin'])], async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await db.query(
            'DELETE FROM courses WHERE id = $1 AND school_id = $2',
            [id, req.user.school_id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Course not found' });
        res.json({ message: 'Course deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Asignar estudiante a curso
router.post('/:id/students', [auth, authorize(['admin'])], async (req, res) => {
    const { id } = req.params;
    const { student_id } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO student_courses (course_id, student_id) VALUES ($1, $2) RETURNING *',
            [id, student_id]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener estudiantes de un curso
router.get('/:id/students', auth, async (req, res) => {
    const { id } = req.params;
    try {
        const { rows } = await db.query(`
            SELECT s.* FROM students s
            JOIN student_courses sc ON s.id = sc.student_id
            WHERE sc.course_id = $1 AND s.school_id = $2
        `, [id, req.user.school_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eliminar estudiante de curso
router.delete('/:id/students/:student_id', [auth, authorize(['admin'])], async (req, res) => {
    const { id, student_id } = req.params;
    try {
        await db.query(
            'DELETE FROM student_courses WHERE course_id = $1 AND student_id = $2',
            [id, student_id]
        );
        res.json({ message: 'Student removed from course' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
