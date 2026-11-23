'use client';

import { useLocalized } from '@/components/locale-provider';
import { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { getSupabase } from '@/lib/supabase-service';
import { beginSocialSignup, providerName, type SocialProvider } from '@/lib/social-auth';
import { hasRegistrationConsent, saveRegistrationConsent } from '@/lib/registration-consent';
import { hasMemberConsent, acceptMemberConsent } from '@/lib/member-consent';
import { qaAuthEnabled, qaEmails } from '@/lib/qa-auth';
import { clearDemoLogin } from '@/lib/demo-login';
import { Logo, Modal } from './ui';
import { SocialChoices } from './social-buttons';
import { LegalDocument, legalTitle, type LegalKind } from './legal-document';

export default function Signup() {
  const localize = useLocalized();
  const [provider, setProvider] = useState<SocialProvider>('google');
  const [agreed, setAgreed] = useState(false);
  const [policy, setPolicy] = useState<LegalKind | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [existingMember, setExistingMember] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    document.title = localize.text('회원가입 · GG-O');
  }, [localize.locale]);

  useEffect(() => {
    let active = true;
    const selected = new URLSearchParams(window.location.search).get('provider');
    if (selected === 'google' || selected === 'facebook') {
      setProvider(selected);
    }

    const client = getSupabase();
    setConnected(!!client);
    if (!client) {
      setReady(true);
      return;
    }

    client.auth
      .getUser()
      .then(async ({ data }) => {
        if (!active) return;
        if (data.user && (await hasMemberConsent(client, data.user.id))) {
          if (active) window.location.replace('/#my');
          return;
        }
        setExistingMember(!!data.user);
        const current = data.user?.app_metadata.provider;
        if (current === 'google' || current === 'facebook') {
          setProvider(current);
        }
      })
      .catch(() => {
        if (active) setError('가입 동의 기록을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const consent = (value: boolean) => {
    setError('');
    try {
      saveRegistrationConsent(value);
      setAgreed(value);
    } catch {
      setAgreed(false);
      setError('동의 상태를 저장하지 못했습니다. 브라우저의 사이트 저장 기능을 허용해 주세요.');
    }
  };

  return localize(
    <main className="signup-page">
      <div className="signup-card">
        <a className="signup-back" href="/?login=1">
          <ArrowLeft size={16} />
          로그인으로
        </a>
        <Logo />
        <p className="eyebrow">같이 가자, 우리.</p>
        <h1>
          내 취향이 만나는 곳,
          <br />
          GG-O 회원가입.
        </h1>
        <p className="signup-intro">
          구글 또는 페이스북 계정으로 간편하게 시작하세요.
          <br />
          커뮤니티에서는 이름과 프로필이 공개되지 않습니다.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setError('');
            if (!agreed || !hasRegistrationConsent()) {
              setError('이용약관과 개인정보 처리방침에 먼저 동의해 주세요.');
              return;
            }
            setBusy(true);
            try {
              if (existingMember) {
                const client = getSupabase();
                if (!client) throw new Error('회원 시스템이 아직 연결되지 않았습니다.');
                const { data, error } = await client.auth.getUser();
                if (error || !data.user) throw new Error('로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.');
                await acceptMemberConsent(client, data.user.id);
                clearDemoLogin();
                window.location.assign('/#my');
              } else if (qaAuthEnabled) {
                const client = getSupabase();
                const email = String(form.get('email'));
                if (!client || !qaEmails.includes(email)) throw new Error('지정된 테스트 이메일을 사용해 주세요.');
                const { data, error } = await client.auth.signUp({email, password: String(form.get('password'))});
                if (error) throw error;
                if (data.session && data.user) {
                  await acceptMemberConsent(client, data.user.id);
                  window.location.assign('/');
                } else {
                  setError('테스트 계정 인증을 완료한 뒤 로그인해 주세요.');
                  setBusy(false);
                }
              } else {
                await beginSocialSignup(provider);
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : '회원가입을 시작하지 못했습니다. 다시 시도해 주세요.');
              setBusy(false);
            }
          }}
        >
          {qaAuthEnabled && !existingMember ? <>
            <label>테스트 이메일<input name="email" type="email" required /></label>
            <label>테스트 비밀번호<input name="password" type="password" minLength={12} required /></label>
          </> : <>
            <span className="signup-provider-label">가입할 계정 선택</span>
            <SocialChoices selected={provider} onSelect={setProvider} disabled={busy || existingMember} />
          </>}

          {existingMember && (
            <p className="signup-connected-note">
              <Check size={16} />
              이미 연결된 계정으로 가입 동의를 마무리합니다.
            </p>
          )}

          <div className="signup-consent">
            <input
              type="checkbox"
              id="signup-consent"
              checked={agreed}
              onChange={(e) => consent(e.target.checked)}
              required
              disabled={!ready || busy}
              aria-labelledby="signup-consent-copy"
            />
            <span id="signup-consent-copy">
              회원가입 시{' '}
              <button type="button" onClick={() => setPolicy('terms')}>
                [이용약관]
              </button>{' '}
              및{' '}
              <button type="button" onClick={() => setPolicy('privacy')}>
                [개인정보 처리방침]
              </button>
              에 동의합니다.
            </span>
          </div>

          <button className="button button-dark full-width signup-submit" disabled={!ready || !agreed || busy}>
            {busy ? `${providerName(provider)} 계정 확인 중` : '동의하고 회원가입'}
            <ArrowRight size={18} />
          </button>

          {error && (
            <p className="login-error signup-error" role="alert">
              {error}
            </p>
          )}
        </form>

        {!connected && <p className="signup-connection-note">소셜 로그인을 준비 중입니다.</p>}

        <p className="signup-storage-note">
          동의 기록은 회원 계정에 저장됩니다. 다른 기기에서도 유지되며, 약관이 바뀌면 다시 동의가 필요합니다.
        </p>
        <p className="signup-login-link">
          이미 계정이 있나요? <a href="/?login=1">로그인</a>
        </p>
      </div>

      {policy && (
        <Modal title={legalTitle(policy)} close={() => setPolicy(null)} wide>
          <LegalDocument kind={policy} />
        </Modal>
      )}
    </main>
  );
}
