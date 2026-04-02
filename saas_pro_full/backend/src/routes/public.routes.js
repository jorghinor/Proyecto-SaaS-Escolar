const express = require('express');
const router = express.Router();
const db = require('../db');
const { auth } = require('../middleware/auth.middleware');

// POST /contact - Submit contact form
router.post('/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        
        if (!name || !email || !subject || !message) {
            return res.status(400).json({ error: 'Name, email, subject and message are required' });
        }
        
        const { rows } = await db.query(
            `INSERT INTO contact_submissions (name, email, phone, subject, message)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [name, email, phone || null, subject, message]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Message sent successfully',
            data: rows[0]
        });
    } catch (err) {
        console.error('Error saving contact submission:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /newsletter/subscribe - Subscribe to newsletter
router.post('/newsletter/subscribe', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // Check if already subscribed
        const { rows: existing } = await db.query(
            'SELECT * FROM newsletter_subscribers WHERE email = $1',
            [email]
        );
        
        if (existing.length > 0) {
            if (existing[0].subscribed) {
                return res.status(400).json({ error: 'Email already subscribed' });
            } else {
                // Resubscribe
                await db.query(
                    'UPDATE newsletter_subscribers SET subscribed = true, name = $1 WHERE email = $2',
                    [name || null, email]
                );
                return res.json({ success: true, message: 'Welcome back! Subscription reactivated' });
            }
        }
        
        const { rows } = await db.query(
            `INSERT INTO newsletter_subscribers (email, name)
             VALUES ($1, $2)
             RETURNING *`,
            [email, name || null]
        );
        
        res.status(201).json({ 
            success: true, 
            message: 'Subscribed successfully',
            data: rows[0]
        });
    } catch (err) {
        console.error('Error subscribing to newsletter:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /newsletter/subscribers - Get all subscribers (admin only)
router.get('/newsletter/subscribers', auth, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM newsletter_subscribers WHERE subscribed = true ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching subscribers:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /contact/submissions - Get all contact submissions (admin only)
router.get('/contact/submissions', auth, async (req, res) => {
    try {
        const { rows } = await db.query(
            'SELECT * FROM contact_submissions ORDER BY created_at DESC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error fetching contact submissions:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /contact/submissions/:id - Update submission status
router.put('/contact/submissions/:id', auth, async (req, res) => {
    try {
        const { status } = req.body;
        const { rows } = await db.query(
            'UPDATE contact_submissions SET status = $1 WHERE id = $2 RETURNING *',
            [status, req.params.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Submission not found' });
        }
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating submission:', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE /contact/submissions/:id - Delete submission
router.delete('/contact/submissions/:id', auth, async (req, res) => {
    try {
        await db.query('DELETE FROM contact_submissions WHERE id = $1', [req.params.id]);
        res.json({ message: 'Submission deleted' });
    } catch (err) {
        console.error('Error deleting submission:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
