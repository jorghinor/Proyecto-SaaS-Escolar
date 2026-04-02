const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

// GET /schools - Get all schools with pagination, search and filters
router.get('/', auth, async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            school_type,
            education_level,
            is_active 
        } = req.query;
        
        const offset = (page - 1) * limit;
        
        // Build WHERE clause for filters
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        
        if (search) {
            whereClause += ` AND (name ILIKE $${paramIndex} OR code ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        
        if (school_type) {
            whereClause += ` AND school_type = $${paramIndex}`;
            params.push(school_type);
            paramIndex++;
        }
        
        if (education_level) {
            whereClause += ` AND education_level = $${paramIndex}`;
            params.push(education_level);
            paramIndex++;
        }
        
        if (is_active !== undefined) {
            whereClause += ` AND is_active = $${paramIndex}`;
            params.push(is_active === 'true');
            paramIndex++;
        }
        
        // Get count first (without current school marker)
        const countResult = await db.query(
            `SELECT COUNT(*) FROM schools ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);
        
        // Get schools with current school marker
        const currentSchoolId = req.user.school_id;
        const { rows } = await db.query(`
            SELECT *, CASE WHEN id = $${paramIndex} THEN true ELSE false END as is_current 
            FROM schools ${whereClause} 
            ORDER BY name 
            LIMIT $${paramIndex + 1} OFFSET $${paramIndex + 2}
        `, [...params, currentSchoolId, limit, offset]);
        
        res.json({
            data: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching schools:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /schools/:id - Get single school
router.get('/:id', auth, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM schools WHERE id = $1', [req.params.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'School not found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error fetching school:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /schools - Create new school
router.post('/', auth, async (req, res) => {
    try {
        const {
            name, code, address, phone, email, website, logo_url,
            director_name, director_phone, director_email,
            foundation_date, school_type, education_level
        } = req.body;
        
        const { rows } = await db.query(`
            INSERT INTO schools (name, code, address, phone, email, website, logo_url,
                director_name, director_phone, director_email,
                foundation_date, school_type, education_level)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [name, code, address, phone, email, website, logo_url,
            director_name, director_phone, director_email,
            foundation_date, school_type, education_level]);
        
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error creating school:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /schools/:id - Update school
router.put('/:id', auth, async (req, res) => {
    try {
        const {
            name, code, address, phone, email, website, logo_url,
            director_name, director_phone, director_email,
            foundation_date, school_type, education_level, is_active
        } = req.body;
        
        const { rows } = await db.query(`
            UPDATE schools 
            SET name = COALESCE($1, name),
                code = COALESCE($2, code),
                address = COALESCE($3, address),
                phone = COALESCE($4, phone),
                email = COALESCE($5, email),
                website = COALESCE($6, website),
                logo_url = COALESCE($7, logo_url),
                director_name = COALESCE($8, director_name),
                director_phone = COALESCE($9, director_phone),
                director_email = COALESCE($10, director_email),
                foundation_date = COALESCE($11, foundation_date),
                school_type = COALESCE($12, school_type),
                education_level = COALESCE($13, education_level),
                is_active = COALESCE($14, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $15
            RETURNING *
        `, [name, code, address, phone, email, website, logo_url,
            director_name, director_phone, director_email,
            foundation_date, school_type, education_level,
            is_active, req.params.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'School not found' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating school:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /schools/:id - Delete school
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query('DELETE FROM schools WHERE id = $1 RETURNING id', [req.params.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'School not found' });
        }
        
        res.json({ message: 'School deleted successfully' });
    } catch (err) {
        console.error('Error deleting school:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /schools/:id/switch - Switch to a different school
router.post('/:id/switch', auth, async (req, res) => {
    try {
        const schoolId = req.params.id;
        
        console.log('=== SWITCH SCHOOL ===');
        console.log('User ID:', req.user.id);
        console.log('Current school_id:', req.user.school_id);
        console.log('New school_id:', schoolId);
        
        // Verify user has access to this school (is admin of the system)
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Only admins can switch schools' });
        }
        
        // Update user's school_id in database
        const result = await db.query(
            'UPDATE users SET school_id = $1 WHERE id = $2 RETURNING *',
            [schoolId, req.user.id]
        );
        
        const updatedUser = result.rows[0];
        console.log('Usuario actualizado:', updatedUser);
        
        res.json({ 
            success: true, 
            message: 'Colegio cambiado correctamente',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                school_id: updatedUser.school_id
            }
        });
    } catch (err) {
        console.error('Error switching school:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
