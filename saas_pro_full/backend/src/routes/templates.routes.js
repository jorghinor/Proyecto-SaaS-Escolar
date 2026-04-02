const router = require('express').Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

// GET /templates - Get all templates for current school
router.get('/', auth, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM subject_templates WHERE school_id = $1 ORDER BY name',
            [req.user.school_id]
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /templates - Create new template
router.post('/', auth, async (req, res) => {
    try {
        const { name, description, default_score, is_active } = req.body;
        
        const { rows } = await db.query(`
            INSERT INTO subject_templates (school_id, name, description, default_score, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `, [req.user.school_id, name, description, default_score || null, is_active !== false]);
        
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('Error creating template:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /templates/:id - Update template
router.put('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, default_score, is_active } = req.body;
        
        const { rows } = await db.query(`
            UPDATE subject_templates 
            SET name = COALESCE($1, name),
                description = COALESCE($2, description),
                default_score = COALESCE($3, default_score),
                is_active = COALESCE($4, is_active),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5 AND school_id = $6
            RETURNING *
        `, [name, description, default_score, is_active, id, req.user.school_id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Template not found or access denied' });
        }
        
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating template:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /templates/:id - Delete template
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await db.query(
            'DELETE FROM subject_templates WHERE id = $1 AND school_id = $2 RETURNING id',
            [req.params.id, req.user.school_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Template not found or access denied' });
        }
        
        res.json({ message: 'Template deleted successfully' });
    } catch (err) {
        console.error('Error deleting template:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /templates/bulk-import - Import multiple templates
router.post('/bulk-import', auth, async (req, res) => {
    try {
        const { templates } = req.body; // Array of {name, description, default_score}
        
        if (!Array.isArray(templates) || templates.length === 0) {
            return res.status(400).json({ error: 'Debe proporcionar una lista de plantillas' });
        }
        
        const importedTemplates = [];
        const errors = [];
        
        for (let i = 0; i < templates.length; i++) {
            const template = templates[i];
            try {
                const { rows } = await db.query(`
                    INSERT INTO subject_templates (school_id, name, description, default_score, is_active)
                    VALUES ($1, $2, $3, $4, true)
                    ON CONFLICT (school_id, name) DO UPDATE SET
                        description = EXCLUDED.description,
                        default_score = EXCLUDED.default_score,
                        is_active = true,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING *
                `, [req.user.school_id, template.name, template.description || '', template.default_score || null]);
                
                importedTemplates.push(rows[0]);
            } catch (err) {
                errors.push({ index: i, name: template.name, error: err.message });
            }
        }
        
        res.json({
            success: true,
            message: `Se importaron ${importedTemplates.length} plantillas`,
            imported: importedTemplates.length,
            failed: errors.length,
            data: importedTemplates,
            errors: errors
        });
    } catch (err) {
        console.error('Error importing templates:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /templates/create-defaults - Crear plantillas por defecto
router.post('/create-defaults', auth, async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        
        // Verificar si ya existen plantillas
        const { rows: existing } = await db.query(
            'SELECT COUNT(*) FROM subject_templates WHERE school_id = $1',
            [schoolId]
        );
        
        if (parseInt(existing[0].count) > 0) {
            return res.status(400).json({ 
                error: 'Ya existen plantillas para este colegio',
                count: existing[0].count 
            });
        }
        
        // Plantillas comunes para primaria/secundaria
        const defaultTemplates = [
            { name: 'Matemáticas', description: 'Álgebra, geometría y aritmética', default_score: 6.0 },
            { name: 'Lenguaje', description: 'Literatura, gramática y composición', default_score: 6.0 },
            { name: 'Ciencias Naturales', description: 'Biología, física y química', default_score: 6.0 },
            { name: 'Ciencias Sociales', description: 'Historia, geografía y civismo', default_score: 6.0 },
            { name: 'Inglés', description: 'Idoma extranjero', default_score: 6.0 },
            { name: 'Educación Física', description: 'Deportes y actividad física', default_score: 6.0 },
            { name: 'Arte y Música', description: 'Expresión artística y musical', default_score: 6.0 },
            { name: 'Tecnología', description: 'Informática y computación', default_score: 6.0 },
            { name: 'Ética y Valores', description: 'Formación moral y ciudadana', default_score: 6.0 },
        ];
        
        const inserted = [];
        for (const template of defaultTemplates) {
            const { rows } = await db.query(`
                INSERT INTO subject_templates (school_id, name, description, default_score, is_active)
                VALUES ($1, $2, $3, $4, true)
                RETURNING *
            `, [schoolId, template.name, template.description, template.default_score]);
            inserted.push(rows[0]);
        }
        
        res.json({
            success: true,
            message: `Se crearon ${inserted.length} plantillas exitosamente`,
            data: inserted
        });
    } catch (err) {
        console.error('Error creating default templates:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
