'use client';

import { useLocale } from './locale-provider';
import { InformationLinks } from './information-links';

const contact = 'contact.US.GGO@gmail.com';

const instructions = {
  ko: {
    title: '계정 및 데이터 삭제 요청',
    intro: 'Facebook으로 가입했거나 로그인한 GG-O 계정과 관련 데이터의 삭제를 요청할 수 있습니다.',
    steps: [
      'GG-O 계정에 연결된 이메일 주소에서 아래 연락처로 메일을 보내 주세요.',
      '메일 제목은 “GG-O 데이터 삭제 요청”으로 적고, 본문에는 GG-O 계정 전체를 삭제하려는지 또는 Facebook 로그인으로 연결된 데이터만 삭제하려는지 알려 주세요.',
      '요청을 처리하려면 계정 소유 확인이 필요할 수 있습니다. 비밀번호나 인증번호는 보내지 마세요.',
    ],
    note: 'Facebook 설정에서 GG-O 연결을 해제하는 것과 GG-O에 저장된 데이터를 삭제하는 것은 별도입니다.',
    privacy: '개인정보처리방침',
  },
  vi: {
    title: 'Yêu cầu xóa tài khoản và dữ liệu',
    intro: 'Bạn có thể yêu cầu xóa tài khoản GG-O và dữ liệu liên quan đến tài khoản đã đăng ký hoặc đăng nhập bằng Facebook.',
    steps: [
      'Gửi thư đến địa chỉ bên dưới từ email được liên kết với tài khoản GG-O của bạn.',
      'Dùng tiêu đề “Yêu cầu xóa dữ liệu GG-O”. Hãy cho biết bạn muốn xóa toàn bộ tài khoản GG-O hay chỉ dữ liệu liên kết qua Đăng nhập bằng Facebook.',
      'Chúng tôi có thể cần xác minh quyền sở hữu tài khoản. Vui lòng không gửi mật khẩu hoặc mã xác minh.',
    ],
    note: 'Việc gỡ kết nối GG-O trong cài đặt Facebook và việc xóa dữ liệu lưu tại GG-O là hai việc riêng biệt.',
    privacy: 'Chính sách bảo mật',
  },
  en: {
    title: 'Account and data deletion requests',
    intro: 'If you signed up or signed in to GG-O with Facebook, you can request deletion of your account and related data.',
    steps: [
      'Email the address below from the email account linked to your GG-O account.',
      'Use the subject “GG-O data deletion request”. Say whether you want to delete your whole GG-O account or only the data linked through Facebook Login.',
      'We may need to verify that you own the account. Please leave passwords and verification codes out of your message.',
    ],
    note: 'Removing GG-O in your Facebook settings is separate from deleting your data stored by GG-O.',
    privacy: 'Privacy policy',
  },
};

export function DataDeletionInstructions() {
  const { locale } = useLocale();
  const copy = instructions[locale];

  return (
    <main className="legal-page shell section" lang={locale}>
      <p className="eyebrow"><a href="/">GG-O</a></p>
      <h1>{copy.title}</h1>
      <article className="legal-document">
        <div className="information-copy">
          <p>{copy.intro}</p>
          <ol>{copy.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <p><a href={`mailto:${contact}`}>{contact}</a></p>
          <p>{copy.note}</p>
          <p><a href="/privacy/">{copy.privacy}</a></p>
        </div>
      </article>
      <InformationLinks />
    </main>
  );
}
