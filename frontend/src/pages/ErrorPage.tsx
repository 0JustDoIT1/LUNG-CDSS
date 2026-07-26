import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError();

  let message = "알 수 없는 오류가 발생했습니다.";
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div style={{ textAlign: "center", padding: "80px 20px" }}>
      <h1>오류가 발생했습니다</h1>
      <p>{message}</p>
      <Link to="/">홈으로 돌아가기</Link>
    </div>
  );
}