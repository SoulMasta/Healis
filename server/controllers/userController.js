const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User, RefreshToken } = require('../models/models');
const { randomToken, hashToken } = require('../utils/authTokens');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY;
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const BCRYPT_ROUNDS = Math.min(Math.max(Number(process.env.BCRYPT_ROUNDS || 10), 8), 14);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  let s = String(value || '').trim();
  if (s.startsWith('@')) s = s.slice(1);
  s = s.toLowerCase();
  // Keep it URL / mention friendly and predictable.
  s = s.replace(/[^a-z0-9_]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  if (s.length > 32) s = s.slice(0, 32);
  return s;
}

function isValidUsername(username) {
  return /^[a-z0-9_]{3,32}$/.test(String(username || ''));
}

async function ensureUniqueUsername(base) {
  const root = normalizeUsername(base) || 'user';
  for (let i = 0; i < 100; i += 1) {
    const suffix = i === 0 ? '' : `_${Math.floor(Math.random() * 10_000)}`;
    const candidate = normalizeUsername(`${root}${suffix}`);
    if (!isValidUsername(candidate)) continue;
    // eslint-disable-next-line no-await-in-loop
    const exists = await User.findOne({ where: { username: candidate } });
    if (!exists) return candidate;
  }
  // Worst-case fallback
  return `user_${randomToken(6).toLowerCase()}`.replace(/[^a-z0-9_]/g, '').slice(0, 32);
}

function isValidEmail(email) {
  // Simple sanity check; you can swap to a stricter validator later.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeNickname(value) {
  const s = String(value || '').trim();
  return s ? s.slice(0, 80) : '';
}

function normalizeStudyGroup(value) {
  const s = String(value || '').trim();
  return s ? s.slice(0, 80) : null;
}

function normalizeFaculty(value) {
  const s = String(value || '').trim();
  return s ? s.slice(0, 120) : null;
}

function normalizeCourse(value) {
  const raw = value;
  const course = raw === '' || raw === null || raw === undefined ? null : Number(raw);
  if (course === null) return null;
  if (!Number.isFinite(course) || course % 1 !== 0 || course < 1 || course > 10) return 'INVALID';
  return course;
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/user',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
  // Cross-origin (Vercel↔Railway): SameSite=None;Secure required. Do not set domain.
  return opts;
}

function serializeProfile(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    username: user.username || null,
    nickname: user.nickname || null,
    studyGroup: user.studyGroup || null,
    course: typeof user.course === 'number' ? user.course : user.course || null,
    faculty: user.faculty || null,
    avatarUrl: user.avatarUrl || null,
  };
}

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, username: user.username || null, avatarUrl: user.avatarUrl || null },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function getDeviceId(req) {
  const header = String(req.headers['x-device-id'] || '').trim().slice(0, 64);
  if (header) return header;
  const ua = String(req.headers['user-agent'] || '').slice(0, 64);
  return ua || null;
}

async function issueRefreshToken({ userId, req, transaction }) {
  const raw = randomToken(32);
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const deviceId = getDeviceId(req);

  await RefreshToken.create(
    {
      userId,
      tokenHash,
      deviceId,
      expiresAt,
      userAgent: String(req.headers['user-agent'] || '').slice(0, 1000) || null,
      ip: String(req.ip || '').slice(0, 100) || null,
    },
    transaction ? { transaction } : undefined
  );

  return { raw, tokenHash, expiresAt };
}

class UserController {
  async getProfile(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      return res.json({ profile: serializeProfile(user) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const next = {};

      if (req.body?.username !== undefined) {
        const normalized = normalizeUsername(req.body.username);
        if (!normalized) return res.status(400).json({ error: 'Username is required' });
        if (!isValidUsername(normalized)) {
          return res.status(400).json({ error: 'Username must be 3-32 chars: a-z, 0-9, _' });
        }
        const exists = await User.findOne({ where: { username: normalized } });
        if (exists && exists.id !== user.id) {
          return res.status(400).json({ error: 'This username is already taken' });
        }
        next.username = normalized;
      }

      if (req.body?.nickname !== undefined) {
        const nickname = String(req.body.nickname || '').trim();
        next.nickname = nickname ? nickname.slice(0, 80) : null;
      }

      if (req.body?.studyGroup !== undefined) {
        const studyGroup = String(req.body.studyGroup || '').trim();
        next.studyGroup = studyGroup ? studyGroup.slice(0, 80) : null;
      }

      if (req.body?.faculty !== undefined) {
        const faculty = String(req.body.faculty || '').trim();
        next.faculty = faculty ? faculty.slice(0, 120) : null;
      }

      if (req.body?.course !== undefined) {
        const raw = req.body.course;
        const course = raw === '' || raw === null ? null : Number(raw);
        if (course === null) {
          next.course = null;
        } else if (!Number.isFinite(course) || course % 1 !== 0 || course < 1 || course > 10) {
          return res.status(400).json({ error: 'Course must be an integer from 1 to 10' });
        } else {
          next.course = course;
        }
      }

      await user.update(next);

      const token = generateAccessToken(user);
      return res.json({ profile: serializeProfile(user), token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  /**
   * Save avatar URL (file already uploaded to Supabase by frontend)
   */
  async uploadAvatar(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const { avatarUrl } = req.body || {};
      if (!avatarUrl) return res.status(400).json({ error: 'No avatar URL provided' });

      await user.update({ avatarUrl });
      const token = generateAccessToken(user);
      return res.status(201).json({ profile: serializeProfile(user), token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async registration(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || '');
      const username = normalizeUsername(req.body?.username);
      const nickname = normalizeNickname(req.body?.nickname);
      const studyGroup = normalizeStudyGroup(req.body?.studyGroup);
      const faculty = normalizeFaculty(req.body?.faculty);
      const course = normalizeCourse(req.body?.course);

      if (!username) return res.status(400).json({ error: 'Username is required' });
      if (!nickname) return res.status(400).json({ error: 'Nickname is required' });
      if (!email) return res.status(400).json({ error: 'Email is required' });
      if (!password) return res.status(400).json({ error: 'Password is required' });

      if (!isValidUsername(username)) {
        return res.status(400).json({ error: 'Username must be 3-32 chars: a-z, 0-9, _' });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'Invalid email' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      if (course === 'INVALID') {
        return res.status(400).json({ error: 'Course must be an integer from 1 to 10' });
      }

      const candidate = await User.findOne({ where: { email } });
      if (candidate) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const usernameTaken = await User.findOne({ where: { username } });
      if (usernameTaken) {
        return res.status(400).json({ error: 'This username is already taken' });
      }

      const hashPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await User.create({
        email,
        password: hashPassword,
        username,
        nickname,
        studyGroup,
        faculty,
        course: course === null ? null : course,
        authProvider: 'local',
      });

      const token = generateAccessToken(user);
      const refresh = await issueRefreshToken({ userId: user.id, req });
      res.cookie('refreshToken', refresh.raw, cookieOptions());

      return res.status(201).json({ token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async login(req, res) {
    try {
      const email = normalizeEmail(req.body?.email);
      const password = String(req.body?.password || '');

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await User.findOne({ where: { email } });
      // Don't reveal if the email exists.
      if (!user) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const token = generateAccessToken(user);
      const refresh = await issueRefreshToken({ userId: user.id, req });
      res.cookie('refreshToken', refresh.raw, cookieOptions());

      return res.json({ token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Refresh access token using httpOnly cookie. Rotates refresh token, supports reuse protection.
  async refresh(req, res) {
    try {
      const raw = req.cookies?.refreshToken;
      const origin = req.headers.origin;
      // #region agent log
      console.log('[DEBUG 401] refresh entry', { hasCookie: Boolean(raw), origin });
      // #endregion
      if (!raw) {
        // #region agent log
        console.log('[DEBUG 401] refresh 401 reason: noCookie');
        // #endregion
        return res.status(401).json({ error: 'Not authorized' });
      }

      const tokenHash = hashToken(raw);
      const token = await RefreshToken.findOne({ where: { tokenHash } });
      if (!token) {
        // #region agent log
        console.log('[DEBUG 401] refresh 401 reason: tokenNotFound');
        // #endregion
        return res.status(401).json({ error: 'Not authorized' });
      }

      // Reuse detection: revoked token presented again -> possible theft. Revoke all tokens for user.
      if (token.revokedAt) {
        await RefreshToken.update(
          { revokedAt: new Date() },
          { where: { userId: token.userId } }
        );
        res.clearCookie('refreshToken', { path: '/api/user' });
        // #region agent log
        console.log('[DEBUG 401] refresh 401 reason: revoked');
        // #endregion
        return res.status(401).json({ error: 'Not authorized' });
      }

      if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
        // #region agent log
        console.log('[DEBUG 401] refresh 401 reason: expired');
        // #endregion
        return res.status(401).json({ error: 'Not authorized' });
      }

      const user = await User.findByPk(token.userId);
      if (!user) {
        // #region agent log
        console.log('[DEBUG 401] refresh 401 reason: noUser');
        // #endregion
        return res.status(401).json({ error: 'Not authorized' });
      }

      const nextRefresh = await issueRefreshToken({ userId: user.id, req });
      await token.update({ revokedAt: new Date(), replacedByTokenHash: nextRefresh.tokenHash });
      res.cookie('refreshToken', nextRefresh.raw, cookieOptions());

      const access = generateAccessToken(user);
      return res.json({ token: access });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async logout(req, res) {
    try {
      const raw = req.cookies?.refreshToken;
      if (raw) {
        const tokenHash = hashToken(raw);
        const token = await RefreshToken.findOne({ where: { tokenHash } });
        if (token && !token.revokedAt) {
          await token.update({ revokedAt: new Date() });
        }
      }
      res.clearCookie('refreshToken', { path: '/api/user' });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // Legacy: issue a new access token from current access token.
  async check(req, res) {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(401).json({ error: 'Not authorized' });
      const token = generateAccessToken(user);
      return res.json({ token });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new UserController();

