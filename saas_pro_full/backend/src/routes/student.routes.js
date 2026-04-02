const router = require('express').Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');
const multer = require('multer');
const XLSX = require('xlsx');

// Configurar multer para uploads en memoria
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos CSV o Excel'));
        }
    }
});

// POST /students/bulk-upload - Carga masiva de estudiantes desde CSV/JSON
router.post('/bulk-upload', auth, async (req, res) => {
    try {
        const { students } = req.body; // Array de estudiantes [{name, grade, parent_email}]
        
        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ error: 'Debe proporcionar una lista de estudiantes' });
        }
        
        const insertedStudents = [];
        const errors = [];
        
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            try {
                const { rows } = await db.query(
                    'INSERT INTO students (name, grade, parent_email, school_id) VALUES ($1, $2, $3, $4) RETURNING *',
                    [student.name, student.grade, student.parent_email, req.user.school_id]
                );
                insertedStudents.push(rows[0]);
            } catch (err) {
                errors.push({ index: i, name: student.name, error: err.message });
            }
        }
        
        res.json({
            success: true,
            message: `Se cargaron ${insertedStudents.length} estudiantes exitosamente`,
            inserted: insertedStudents.length,
            failed: errors.length,
            data: insertedStudents,
            errors: errors
        });
    } catch (err) {
        console.error('Error en carga masiva:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /students/upload-file - Subir archivo CSV/Excel directamente
router.post('/upload-file', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Debe subir un archivo' });
        }
        
        let students = [];
        const buffer = req.file.buffer;
        
        // Determinar tipo de archivo y procesar
        if (req.file.mimetype.includes('excel') || req.file.originalname.endsWith('.xlsx')) {
            // Procesar Excel
            const workbook = XLSX.read(buffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            // Asumir que la primera fila es encabezado
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (row.length >= 3 && row[0]) {
                    students.push({
                        name: row[0]?.toString().trim() || '',
                        grade: row[1]?.toString().trim() || '',
                        parent_email: row[2]?.toString().trim() || ''
                    });
                }
            }
        } else {
            // Procesar CSV
            const csvText = buffer.toString('utf-8');
            const lines = csvText.trim().split('\n');
            
            for (let i = 1; i < lines.length; i++) { // Skip header
                const line = lines[i].trim();
                if (!line) continue;
                
                const parts = line.split(',');
                if (parts.length >= 3 && parts[0]) {
                    students.push({
                        name: parts[0].trim(),
                        grade: parts[1].trim(),
                        parent_email: parts[2].trim()
                    });
                }
            }
        }
        
        if (students.length === 0) {
            return res.status(400).json({ error: 'No se encontraron estudiantes en el archivo' });
        }
        
        // Insertar estudiantes usando la función existente
        const insertedStudents = [];
        const errors = [];
        
        for (let i = 0; i < students.length; i++) {
            const student = students[i];
            try {
                const { rows } = await db.query(
                    'INSERT INTO students (name, grade, parent_email, school_id) VALUES ($1, $2, $3, $4) RETURNING *',
                    [student.name, student.grade, student.parent_email, req.user.school_id]
                );
                insertedStudents.push(rows[0]);
            } catch (err) {
                errors.push({ index: i, name: student.name, error: err.message });
            }
        }
        
        res.json({
            success: true,
            message: `Se cargaron ${insertedStudents.length} estudiantes exitosamente`,
            inserted: insertedStudents.length,
            failed: errors.length,
            file_name: req.file.originalname,
            file_type: req.file.mimetype,
            data: insertedStudents,
            errors: errors
        });
    } catch (err) {
        console.error('Error uploading file:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /students/template - Descargar plantilla CSV
router.get('/template', auth, async (req, res) => {
    try {
        const csvContent = `nombre_completo,grado,email_apoderado
Juan Pérez Quispe,4TO PRIMARIA,juan.perez@email.com
Maria Lopez Flores,4TO PRIMARIA,maria.lopez@email.com
Carlos Rodriguez Mamani,4TO PRIMARIA,carlos.rodriguez@email.com
Ana Maria Torres Gomez,5TO PRIMARIA,ana.torres@email.com
Luis Fernando Diaz Castro,6TO PRIMARIA,luis.diaz@email.com`;
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="plantilla_estudiantes.csv"');
        res.send(csvContent);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM students WHERE school_id = $1', [req.user.school_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  const { name, grade, parent_email } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO students (name, grade, parent_email, school_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, grade, parent_email, req.user.school_id]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
    const { id } = req.params;
    const { name, grade, parent_email } = req.body;
    try {
        const { rows } = await db.query(
            'UPDATE students SET name = $1, grade = $2, parent_email = $3 WHERE id = $4 AND school_id = $5 RETURNING *',
            [name, grade, parent_email, id, req.user.school_id]
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Student not found or access denied' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:id', auth, async (req, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await db.query(
            'DELETE FROM students WHERE id = $1 AND school_id = $2',
            [id, req.user.school_id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Student not found or access denied' });
        res.json({ message: 'Student deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;