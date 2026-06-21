const { rules, evaluate } = require('../Lib/syaratRules');
const StudentStatus = require('../models/StudentStatus');

const ALLOWED_JENIS = new Set(Object.keys(rules));

class SmartCheckController {
  fields(req, res) {
    const { jenis } = req.params;
    if (!ALLOWED_JENIS.has(jenis)) {
      return res.status(400).json({ success: false, message: 'Jenis pengecekan tidak valid.' });
    }
    res.json({ success: true, rule: rules[jenis] });
  }

  async lastStatus(req, res) {
    try {
      const { jenis } = req.params;
      if (!ALLOWED_JENIS.has(jenis)) {
        return res.status(400).json({ success: false, message: 'Jenis pengecekan tidak valid.' });
      }
      const record = await StudentStatus.getByUser(req.session.user.id, jenis);
      // mysql2 auto-deserializes JSON columns into real objects already — re-parsing throws.
      const payload = record ? record.payload : null;
      const evaluation = payload ? evaluate(jenis, payload) : null;
      res.json({ success: true, payload, ...evaluation });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async check(req, res) {
    try {
      const { jenis, status } = req.body;
      if (!ALLOWED_JENIS.has(jenis)) {
        return res.status(400).json({ success: false, message: 'Jenis pengecekan tidak valid.' });
      }

      const result = evaluate(jenis, status || {});
      await StudentStatus.upsert(req.session.user.id, jenis, status || {});

      res.json({ success: true, jenis, ...result });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = SmartCheckController;
