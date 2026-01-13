import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Lock, Mail, Loader2, UserPlus, LogIn } from 'lucide-react';
import { login, registration } from '../http/userAPI';
import styles from '../styles/AuthPage.module.css';

function normalizeError(err) {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Something went wrong';
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isRegister = mode === 'register';

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (isRegister) return confirm && password === confirm;
    return true;
  }, [email, password, confirm, isRegister]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (isRegister && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await registration(trimmedEmail, password);
      } else {
        await login(trimmedEmail, password);
      }
      navigate('/home');
    } catch (err) {
      setError(normalizeError(err));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setError(null);
    setPassword('');
    setConfirm('');
    setMode((m) => (m === 'login' ? 'register' : 'login'));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>H</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>Healis</div>
            <div className={styles.brandSub}>{isRegister ? 'Create your account' : 'Sign in to continue'}</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <Link to="/home" className={styles.homeLink}>
            <Home size={18} />
            <span>Home</span>
          </Link>
          <div className={styles.pill}>Free</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <aside className={styles.left}>
            <div className={styles.leftTitle}>{isRegister ? 'Welcome!' : 'Welcome back'}</div>
            <div className={styles.leftSub}>
              {isRegister
                ? 'Create an account to start using workspaces, calendar and settings.'
                : 'Sign in to access your workspaces and continue where you left off.'}
            </div>

            <div className={styles.features}>
              <div className={styles.featureRow}>
                <span className={styles.featureDot} />
                <span>Boards & workspaces</span>
              </div>
              <div className={styles.featureRow}>
                <span className={styles.featureDot} />
                <span>Calendar of events</span>
              </div>
              <div className={styles.featureRow}>
                <span className={styles.featureDot} />
                <span>Secure access with token</span>
              </div>
            </div>

            <button type="button" className={styles.switchBtn} onClick={switchMode}>
              {isRegister ? (
                <>
                  <LogIn size={18} />
                  I already have an account
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Create new account
                </>
              )}
            </button>
          </aside>

          <section className={styles.right}>
            <div className={styles.formTop}>
              <div className={styles.formTitle}>{isRegister ? 'Registration' : 'Login'}</div>
              <div className={styles.formSub}>
                {isRegister ? 'Use your email and create a password.' : 'Use your email and password.'}
              </div>
            </div>

            <form className={styles.form} onSubmit={onSubmit}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="email">
                  Email
                </label>
                <div className={styles.inputWrap}>
                  <Mail size={18} className={styles.inputIcon} />
                  <input
                    id="email"
                    type="email"
                    className={styles.formInput}
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="password">
                  Password
                </label>
                <div className={styles.inputWrap}>
                  <Lock size={18} className={styles.inputIcon} />
                  <input
                    id="password"
                    type="password"
                    className={styles.formInput}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                  />
                </div>
              </div>

              {isRegister && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="confirm">
                    Confirm password
                  </label>
                  <div className={styles.inputWrap}>
                    <Lock size={18} className={styles.inputIcon} />
                    <input
                      id="confirm"
                      type="password"
                      className={styles.formInput}
                      placeholder="Repeat password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
              )}

              {error ? (
                <div className={styles.error} role="alert">
                  {error}
                </div>
              ) : null}

              <div className={styles.actions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/home')} disabled={loading}>
                  Cancel
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={!canSubmit || loading}>
                  {loading ? <Loader2 size={18} className={styles.spinner} /> : null}
                  {isRegister ? 'Create account' : 'Sign in'}
                </button>
              </div>

              <div className={styles.hint}>
                {isRegister ? (
                  <span>
                    Already registered?{' '}
                    <button type="button" className={styles.linkBtn} onClick={switchMode} disabled={loading}>
                      Sign in
                    </button>
                  </span>
                ) : (
                  <span>
                    New here?{' '}
                    <button type="button" className={styles.linkBtn} onClick={switchMode} disabled={loading}>
                      Create an account
                    </button>
                  </span>
                )}
              </div>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}