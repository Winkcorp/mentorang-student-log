/**
 * 시리즈 수정·삭제의 적용 범위.
 *
 * "use server" 모듈은 async 함수만 export할 수 있으므로 상수는 여기에 둔다
 * (클라이언트 컴포넌트도 이 라벨을 쓴다).
 */
export type EditScope = "single" | "following" | "all";

export const SCOPE_LABEL: Record<EditScope, string> = {
  single: "이 회차만",
  following: "이 회차 이후 전체",
  all: "전체 시리즈",
};

export const SCOPES: EditScope[] = ["single", "following", "all"];
