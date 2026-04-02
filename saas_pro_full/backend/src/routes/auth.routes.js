const router = require('express').Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../db');
const { auth, authorize } = require('../middleware/auth.middleware');

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return res.status(400).send('Email is not found');

    const validPass = await bcrypt.compare(password, rows[0].password);
    if (!validPass) return res.status(400).send('Invalid password');

    const token = jwt.sign(
      { id: rows[0].id, school_id: rows[0].school_id, role: rows[0].role },
      process.env.JWT_SECRET || 'secret'
    );
    res.header('auth-token', token).json({ token, role: rows[0].role });
  } catch (err) {
    res.status(500).send(err.message);
  }
});

router.post('/register', async (req, res) => {
  const { name, email, password, school_id, role } = req.body;
  const userRole = role || 'admin';
  
  // Si hay un usuario autenticado, usar su school_id
  let finalSchoolId = school_id;
  if (req.headers['auth-token']) {
    try {
      const decoded = jwt.verify(req.headers['auth-token'], process.env.JWT_SECRET || 'secret');
      finalSchoolId = decoded.school_id;
    } catch (e) {
      // Token inválido, usar el proporcionado
    }
  }
  
  if (!finalSchoolId) {
    return res.status(400).send('school_id is required');
  }

  const salt = await bcrypt.genSalt(10);
  const hashPassword = await bcrypt.hash(password, salt);

  try {
    const { rows } = await db.query(
      'INSERT INTO users (name, email, password, school_id, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, email, hashPassword, finalSchoolId, userRole]
    );
    res.send({ user: rows[0].id });
  } catch (err) {
    res.status(400).send(err.message);
  }
});

// CRUD de usuarios
router.get('/users', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, name, email, role, school_id FROM users WHERE school_id = $1', [req.user.school_id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', [auth, authorize(['admin'])], async (req, res) => {
  const { id } = req.params;
  const { name, email, role } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE users SET name = $1, email = $2, role = $3 WHERE id = $4 AND school_id = $5 RETURNING id, name, email, role',
      [name, email, role, id, req.user.school_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/users/:id', [auth, authorize(['admin'])], async (req, res) => {
  const { id } = req.params;
  try {
    const { rowCount } = await db.query('DELETE FROM users WHERE id = $1 AND school_id = $2', [id, req.user.school_id]);
    if (rowCount === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Student login endpoint
router.post('/student-login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Find student credentials
    const { rows: credRows } = await db.query(
      'SELECT sc.*, s.name, s.grade, s.id as student_id, s.school_id FROM student_credentials sc JOIN students s ON sc.student_id = s.id WHERE sc.username = $1 AND sc.is_active = true',
      [username]
    );
    
    if (credRows.length === 0) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }
    
    const cred = credRows[0];
    
    // Verify password
    const validPass = await bcrypt.compare(password, cred.password);
    if (!validPass) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }
    
    // Update last login
    await db.query(
      'UPDATE student_credentials SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [cred.id]
    );
    
    // Generate token
    const token = jwt.sign(
      { 
        id: cred.student_id, 
        school_id: cred.school_id, 
        role: 'student',
        credential_id: cred.id
      },
      process.env.JWT_SECRET || 'secret'
    );
    
    res.json({
      token,
      student: {
        id: cred.student_id,
        name: cred.name,
        grade: cred.grade,
        school_id: cred.school_id
      }
    });
    
  } catch (err) {
    console.error('Student login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create student credentials (admin only)
router.post('/student-credentials', auth, async (req, res) => {
  const { student_id, username, password } = req.body;
  const schoolId = req.user.school_id;
  
  try {
    // Verify student belongs to school
    const studentCheck = await db.query(
      'SELECT id FROM students WHERE id = $1 AND school_id = $2',
      [student_id, schoolId]
    );
    
    if (studentCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Student not found in your school' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashPassword = await bcrypt.hash(password, salt);
    
    const { rows } = await db.query(
      'INSERT INTO student_credentials (student_id, username, password) VALUES ($1, $2, $3) RETURNING id, username, student_id, is_active, created_at',
      [student_id, username, hashPassword]
    );
    
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Create student credentials error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;