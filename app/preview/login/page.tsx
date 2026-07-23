import LoginPage from "@/app/login/page";

export default function PreviewLoginPage() {
  // 실제 로그인 화면 컴포넌트 그대로 (제출 시 DB 미연결 에러만 표시됨)
  return <LoginPage />;
}
