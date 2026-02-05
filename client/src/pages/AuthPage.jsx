import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Home, Lock, Mail, Loader2, UserPlus, LogIn, AtSign, User, GraduationCap } from 'lucide-react';
import { googleAuth, login, registration } from '../http/userAPI';
import styles from '../styles/AuthPage.module.css';

function normalizeError(err) {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Что-то пошло не так';
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [studyGroup, setStudyGroup] = useState('');
  const [faculty, setFaculty] = useState('');
  const [course, setCourse] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isRegister = mode === 'register';

  const googleBtnRef = useRef(null);
  const googleInitRef = useRef(false);
  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId) return undefined;
    if (googleInitRef.current) return undefined;

    let cancelled = false;

    const ensureScript = () =>
      new Promise((resolve, reject) => {
        if (window.google?.accounts?.id) return resolve(true);
        const existing = document.querySelector('script[data-google-gsi="true"]');
        if (existing) {
          existing.addEventListener('load', () => resolve(true), { once: true });
          existing.addEventListener('error', () => reject(new Error('Failed to load Google script')), { once: true });
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.dataset.googleGsi = 'true';
        script.onload = () => resolve(true);
        script.onerror = () => reject(new Error('Failed to load Google script'));
        document.head.appendChild(script);
      });

    (async () => {
      try {
        await ensureScript();
        if (cancelled) return;
        if (!googleBtnRef.current) return;
        if (!window.google?.accounts?.id) return;

        googleInitRef.current = true;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (resp) => {
            const credential = resp?.credential;
            if (!credential) return;
            setError(null);
            setLoading(true);
            try {
              await googleAuth(credential);
              navigate('/home');
            } catch (err) {
              setError(normalizeError(err));
            } finally {
              setLoading(false);
            }
          },
        });

        // Clear container to avoid StrictMode double-render artifacts.
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          shape: 'pill',
          width: 320,
          text: 'continue_with',
        });
      } catch (e) {
        // Silent: we just won't show Google auth if script fails to load.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleClientId, navigate]);

  const canSubmit = useMemo(() => {
    if (!email.trim() || !password) return false;
    if (isRegister) {
      if (!username.trim() || !nickname.trim()) return false;
      return confirm && password === confirm;
    }
    return true;
  }, [email, password, confirm, isRegister, username, nickname]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Укажите email');
      return;
    }
    if (!password) {
      setError('Укажите пароль');
      return;
    }
    if (isRegister && password !== confirm) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        await registration({
          username: username.trim(),
          nickname: nickname.trim(),
          email: trimmedEmail,
          password,
          studyGroup: studyGroup.trim() || null,
          faculty: faculty.trim() || null,
          course: course === '' ? null : Number(course),
        });
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
    if (mode === 'login') {
      setUsername('');
      setNickname('');
      setStudyGroup('');
      setFaculty('');
      setCourse('');
    }
    setMode((m) => (m === 'login' ? 'register' : 'login'));
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>H</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>Healis</div>
            <div className={styles.brandSub}>{isRegister ? 'Создайте аккаунт' : 'Войдите, чтобы продолжить'}</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <Link to="/home" className={styles.homeLink}>
            <Home size={18} />
            <span>Главная</span>
          </Link>
          <div className={styles.pill}>Бесплатно</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <aside className={styles.left}>
            <div className={styles.leftTitle}>{isRegister ? 'Добро пожаловать!' : 'С возвращением'}</div>
            <div className={styles.leftSub}>
              {isRegister
                ? 'Создайте аккаунт, чтобы пользоваться досками, календарём и настройками.'
                : 'Войдите, чтобы открыть свои доски и продолжить работу.'}
            </div>

            <div className={styles.features}>
              <div className={styles.featureRow}>
                <span className={styles.featureDot} />
                <span>Доски и рабочие пространства</span>
              </div>
              <div className={styles.featureRow}>
                <span className={styles.featureDot} />
                <span>Календарь событий</span>
              </div>
              <div className={styles.featureRow}>
                <span className={styles.featureDot} />
                <span>Безопасный доступ по токену</span>
              </div>
            </div>

            <button type="button" className={styles.switchBtn} onClick={switchMode}>
              {isRegister ? (
                <>
                  <LogIn size={18} />
                  У меня уже есть аккаунт
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Создать аккаунт
                </>
              )}
            </button>
          </aside>

          <section className={styles.right}>
            <div className={styles.formTop}>
              <div className={styles.formTitle}>{isRegister ? 'Регистрация' : 'Вход'}</div>
              <div className={styles.formSub}>
                {isRegister ? 'Заполните профиль и задайте пароль.' : 'Введите email и пароль.'}
              </div>
            </div>

            <form className={styles.form} onSubmit={onSubmit}>
              {googleClientId ? (
                <div className={styles.oauthBlock}>
                  <div ref={googleBtnRef} className={styles.googleBtn} />
                  <div className={styles.divider}>
                    <span>или</span>
                  </div>
                </div>
              ) : null}

              {isRegister && (
                <div className={styles.grid2}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="username">
                      Логин
                    </label>
                    <div className={styles.inputWrap}>
                      <AtSign size={18} className={styles.inputIcon} />
                      <input
                        id="username"
                        type="text"
                        className={styles.formInput}
                        placeholder="логин"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="nickname">
                      Имя
                    </label>
                    <div className={styles.inputWrap}>
                      <User size={18} className={styles.inputIcon} />
                      <input
                        id="nickname"
                        type="text"
                        className={styles.formInput}
                        placeholder="Ваше имя"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        autoComplete="nickname"
                        required
                      />
                    </div>
                  </div>
                </div>
              )}

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
                  Пароль
                </label>
                <div className={styles.inputWrap}>
                  <Lock size={18} className={styles.inputIcon} />
                  <input
                    id="password"
                    type="password"
                    className={styles.formInput}
                    placeholder="Введите пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    required
                  />
                </div>
              </div>

              {isRegister && (
                <>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="confirm">
                      Повторите пароль
                    </label>
                    <div className={styles.inputWrap}>
                      <Lock size={18} className={styles.inputIcon} />
                      <input
                        id="confirm"
                        type="password"
                        className={styles.formInput}
                        placeholder="Повторите пароль"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.optionalTitle}>
                    <GraduationCap size={16} />
                    Дополнительно (учеба)
                  </div>

                  <div className={styles.grid3}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="studyGroup">
                        Группа
                      </label>
                      <input
                        id="studyGroup"
                        type="text"
                        className={styles.formInput}
                        placeholder="напр. ИВТ-21"
                        value={studyGroup}
                        onChange={(e) => setStudyGroup(e.target.value)}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="faculty">
                        Факультет
                      </label>
                      <input
                        id="faculty"
                        type="text"
                        className={styles.formInput}
                        placeholder="напр. Информатика"
                        value={faculty}
                        onChange={(e) => setFaculty(e.target.value)}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel} htmlFor="course">
                        Курс
                      </label>
                      <input
                        id="course"
                        type="number"
                        className={styles.formInput}
                        placeholder="1..10"
                        value={course}
                        onChange={(e) => setCourse(e.target.value)}
                        min={1}
                        max={10}
                      />
                    </div>
                  </div>
                </>
              )}

              {error ? (
                <div className={styles.error} role="alert">
                  {error}
                </div>
              ) : null}

              <div className={styles.actions}>
                <button type="button" className={styles.secondaryBtn} onClick={() => navigate('/home')} disabled={loading}>
                  Отмена
                </button>
                <button type="submit" className={styles.primaryBtn} disabled={!canSubmit || loading}>
                  {loading ? <Loader2 size={18} className={styles.spinner} /> : null}
                  {isRegister ? 'Создать аккаунт' : 'Войти'}
                </button>
              </div>

              <div className={styles.hint}>
                {isRegister ? (
                  <span>
                    Уже зарегистрированы?{' '}
                    <button type="button" className={styles.linkBtn} onClick={switchMode} disabled={loading}>
                      Войти
                    </button>
                  </span>
                ) : (
                  <span>
                    Впервые здесь?{' '}
                    <button type="button" className={styles.linkBtn} onClick={switchMode} disabled={loading}>
                      Создать аккаунт
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