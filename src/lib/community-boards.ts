import { getSupabase } from "./supabase-service";

export interface CommunityPrefix {
  id: string;
  label: string;
  labels?: Partial<Record<"ko" | "vi" | "en", string>>;
  color: string;
  active?: boolean;
}

export interface CommunityBoard {
  name: string;
  labels?: Partial<Record<"ko" | "vi" | "en", string>>;
  position: number;
  active: boolean;
  notice_color?: string;
  prefixes: CommunityPrefix[];
}

async function boardRequest(name: string, args: Record<string, unknown>) {
  const client = getSupabase();
  if (!client) throw new Error("게시판 서버가 연결되지 않았습니다.");
  const { data, error } = await client.rpc(name, args);
  if (error) {
    if (error.message === "GGO_BOARD_NOT_EMPTY") throw new Error("삭제한 글이나 숨긴 글을 포함해 보관된 게시글이 있어 영구 삭제할 수 없습니다. 게시판을 숨기면 이용자에게 보이지 않습니다.");
    if (error.code === "23505") throw new Error("이미 사용 중인 이름입니다.");
    if (error.code === "42501") throw new Error("운영자 권한이 필요합니다.");
    throw new Error("게시판 요청을 처리하지 못했습니다. 입력과 연결 상태를 확인해 주세요.");
  }
  return data;
}

export async function loadCommunityBoards(manage = false): Promise<CommunityBoard[]> {
  const data = await boardRequest("community_board_catalog", { p_manage: manage });
  if (!Array.isArray(data)) throw new Error("게시판 목록을 읽지 못했습니다.");
  return data;
}

export async function manageCommunityBoard(action: string, data: Record<string, unknown>) {
  await boardRequest("community_board_manage", { p_action: action, p_data: data });
}

export async function moveCommunityBoard(board: string, step: -1 | 1) {
  await boardRequest("community_board_move", { p_board: board, p_step: step });
}

export async function deleteEmptyCommunityBoard(board: string) {
  await boardRequest("community_board_delete_empty", { p_board: board });
}
