"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  createRoomBlock,
  deleteRoomBlock,
  toggleMasterStatus,
  upsertRoom,
  upsertSessionType,
  upsertSubject,
  upsertTimeSlot,
  type Result,
} from "./actions";

const input =
  "rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-gray-400 focus:outline-none";
const label = "mb-1 block text-[11px] font-medium text-gray-400";

export interface SubjectRow {
  id: string;
  name: string;
  color: string;
  display_order: number;
  status: string;
}
export interface SessionTypeRow {
  id: string;
  code: string;
  name: string;
  requires_subject: boolean;
  has_progress: boolean;
  display_order: number;
  status: string;
}
export interface TimeSlotRow {
  id: string;
  label: string;
  default_start_time: string;
  default_end_time: string;
  display_order: number;
  status: string;
}
export interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  display_order: number;
  status: string;
}
export interface RoomBlockRow {
  id: string;
  room_id: string;
  date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

/** 서버 액션을 감싸 대기 상태와 오류 문구를 붙여준다 */
function ActionForm({
  action,
  submitLabel,
  children,
  onDone,
}: {
  action: (formData: FormData) => Promise<Result>;
  submitLabel: string;
  children: ReactNode;
  onDone?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          const r = await action(formData);
          setError(r.error);
          if (!r.error) onDone?.();
        });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      {children}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
      >
        {isPending ? "저장 중..." : submitLabel}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
  );
}

function StatusToggle({
  table,
  id,
  status,
}: {
  table: string;
  id: string;
  status: string;
}) {
  return (
    <form action={toggleMasterStatus}>
      <input type="hidden" name="table" value={table} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="current" value={status} />
      <button
        type="submit"
        className="text-xs text-gray-400 hover:text-gray-900 hover:underline"
      >
        {status === "active" ? "비활성화" : "활성화"}
      </button>
    </form>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Row({
  status,
  children,
}: {
  status?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2 ${
        status === "inactive" ? "bg-gray-100 opacity-60" : "bg-white"
      }`}
    >
      {children}
    </li>
  );
}

export function MastersBoard({
  subjects,
  sessionTypes,
  timeSlots,
  rooms,
  roomBlocks,
}: {
  subjects: SubjectRow[];
  sessionTypes: SessionTypeRow[];
  timeSlots: TimeSlotRow[];
  rooms: RoomRow[];
  roomBlocks: RoomBlockRow[];
}) {
  const roomName = (id: string) =>
    rooms.find((r) => r.id === id)?.name ?? "(삭제된 공간)";

  return (
    <div className="space-y-10">
      {/* ---- 과목 --------------------------------------------------- */}
      <Section
        title="과목"
        hint="색상과 정렬순서는 화면이 그대로 사용합니다. 제목에 정렬용 숫자를 붙이지 않습니다."
      >
        <div className="rounded-2xl border border-gray-200/70 bg-white p-3">
          <ActionForm action={upsertSubject} submitLabel="과목 추가">
            <div>
              <label className={label}>과목명 *</label>
              <input name="name" required className={input} placeholder="한국사" />
            </div>
            <div>
              <label className={label}>색상 *</label>
              <input
                name="color"
                type="color"
                defaultValue="#94a3b8"
                className="h-[30px] w-14 rounded-lg border border-gray-200"
              />
            </div>
            <div>
              <label className={label}>정렬</label>
              <input
                name="displayOrder"
                type="number"
                defaultValue={subjects.length + 1}
                className={`${input} w-16`}
              />
            </div>
          </ActionForm>
        </div>

        <ul className="space-y-1.5">
          {subjects.map((s) => (
            <Row key={s.id} status={s.status}>
              <ActionForm action={upsertSubject} submitLabel="저장">
                <input type="hidden" name="id" value={s.id} />
                <span
                  className="h-5 w-5 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                <input
                  name="name"
                  defaultValue={s.name}
                  className={`${input} w-28`}
                />
                <input
                  name="color"
                  type="color"
                  defaultValue={s.color}
                  className="h-[30px] w-14 rounded-lg border border-gray-200"
                />
                <input
                  name="displayOrder"
                  type="number"
                  defaultValue={s.display_order}
                  className={`${input} w-16`}
                />
              </ActionForm>
              <StatusToggle table="subjects" id={s.id} status={s.status} />
            </Row>
          ))}
          {!subjects.length && (
            <p className="text-sm text-gray-400">등록된 과목이 없습니다.</p>
          )}
        </ul>
      </Section>

      {/* ---- 세션유형 ----------------------------------------------- */}
      <Section
        title="세션유형"
        hint="코드는 세션 제목 계산에 쓰입니다(예: 공습_화B_1주/4주_박멘토M_김학생). 과목 무관 유형은 '과목 필요'를 끄세요."
      >
        <div className="rounded-2xl border border-gray-200/70 bg-white p-3">
          <ActionForm action={upsertSessionType} submitLabel="유형 추가">
            <div>
              <label className={label}>코드 *</label>
              <input name="code" required className={`${input} w-24`} placeholder="영어PT" />
            </div>
            <div>
              <label className={label}>이름 *</label>
              <input
                name="name"
                required
                className={`${input} w-40`}
                placeholder="영어 퍼스널트레이닝"
              />
            </div>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
              <input type="checkbox" name="requiresSubject" defaultChecked />
              과목 필요
            </label>
            <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
              <input type="checkbox" name="hasProgress" />
              진도 관리
            </label>
            <div>
              <label className={label}>정렬</label>
              <input
                name="displayOrder"
                type="number"
                defaultValue={sessionTypes.length + 1}
                className={`${input} w-16`}
              />
            </div>
          </ActionForm>
        </div>

        <ul className="space-y-1.5">
          {sessionTypes.map((t) => (
            <Row key={t.id} status={t.status}>
              <ActionForm action={upsertSessionType} submitLabel="저장">
                <input type="hidden" name="id" value={t.id} />
                <input
                  name="code"
                  defaultValue={t.code}
                  className={`${input} w-24`}
                />
                <input
                  name="name"
                  defaultValue={t.name}
                  className={`${input} w-40`}
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    name="requiresSubject"
                    defaultChecked={t.requires_subject}
                  />
                  과목 필요
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    name="hasProgress"
                    defaultChecked={t.has_progress}
                  />
                  진도 관리
                </label>
                <input
                  name="displayOrder"
                  type="number"
                  defaultValue={t.display_order}
                  className={`${input} w-16`}
                />
              </ActionForm>
              <StatusToggle table="session_types" id={t.id} status={t.status} />
            </Row>
          ))}
        </ul>
      </Section>

      {/* ---- 시간대 ------------------------------------------------- */}
      <Section
        title="시간대"
        hint="여기 시각은 시리즈를 만들 때 자동으로 채워지는 기본값입니다. 실제 세션 시각은 시리즈가 따로 보유합니다."
      >
        <div className="rounded-2xl border border-gray-200/70 bg-white p-3">
          <ActionForm action={upsertTimeSlot} submitLabel="시간대 추가">
            <div>
              <label className={label}>라벨 *</label>
              <input name="label" required className={`${input} w-16`} placeholder="C" />
            </div>
            <div>
              <label className={label}>기본 시작 *</label>
              <input name="defaultStart" type="time" required className={input} />
            </div>
            <div>
              <label className={label}>기본 종료 *</label>
              <input name="defaultEnd" type="time" required className={input} />
            </div>
            <div>
              <label className={label}>정렬</label>
              <input
                name="displayOrder"
                type="number"
                defaultValue={timeSlots.length + 1}
                className={`${input} w-16`}
              />
            </div>
          </ActionForm>
        </div>

        <ul className="space-y-1.5">
          {timeSlots.map((s) => (
            <Row key={s.id} status={s.status}>
              <ActionForm action={upsertTimeSlot} submitLabel="저장">
                <input type="hidden" name="id" value={s.id} />
                <input
                  name="label"
                  defaultValue={s.label}
                  className={`${input} w-16`}
                />
                <input
                  name="defaultStart"
                  type="time"
                  defaultValue={s.default_start_time.slice(0, 5)}
                  className={input}
                />
                <input
                  name="defaultEnd"
                  type="time"
                  defaultValue={s.default_end_time.slice(0, 5)}
                  className={input}
                />
                <input
                  name="displayOrder"
                  type="number"
                  defaultValue={s.display_order}
                  className={`${input} w-16`}
                />
              </ActionForm>
              <StatusToggle table="time_slots" id={s.id} status={s.status} />
            </Row>
          ))}
        </ul>
      </Section>

      {/* ---- 공간 --------------------------------------------------- */}
      <Section
        title="공간"
        hint="정원을 비우면 단독 사용(동시 1건)입니다. 값이 있으면 그 인원을 넘을 때만 충돌로 봅니다."
      >
        <div className="rounded-2xl border border-gray-200/70 bg-white p-3">
          <ActionForm action={upsertRoom} submitLabel="공간 추가">
            <div>
              <label className={label}>공간명 *</label>
              <input name="name" required className={`${input} w-32`} placeholder="1:1룸B" />
            </div>
            <div>
              <label className={label}>정원 (비우면 단독)</label>
              <input
                name="capacity"
                type="number"
                min="1"
                className={`${input} w-24`}
                placeholder="단독"
              />
            </div>
            <div>
              <label className={label}>정렬</label>
              <input
                name="displayOrder"
                type="number"
                defaultValue={rooms.length + 1}
                className={`${input} w-16`}
              />
            </div>
          </ActionForm>
        </div>

        <ul className="space-y-1.5">
          {rooms.map((r) => (
            <Row key={r.id} status={r.status}>
              <ActionForm action={upsertRoom} submitLabel="저장">
                <input type="hidden" name="id" value={r.id} />
                <input
                  name="name"
                  defaultValue={r.name}
                  className={`${input} w-32`}
                />
                <input
                  name="capacity"
                  type="number"
                  min="1"
                  defaultValue={r.capacity ?? ""}
                  placeholder="단독"
                  className={`${input} w-24`}
                />
                <input
                  name="displayOrder"
                  type="number"
                  defaultValue={r.display_order}
                  className={`${input} w-16`}
                />
              </ActionForm>
              <StatusToggle table="rooms" id={r.id} status={r.status} />
            </Row>
          ))}
        </ul>
      </Section>

      {/* ---- 공간 사용 불가 구간 ------------------------------------- */}
      <Section
        title="공간 사용 불가 구간"
        hint="청소·행사·점검 등으로 공간을 쓸 수 없는 시간입니다. 충돌 검사에서 세션과 똑같이 취급되어, 정원과 무관하게 차단됩니다."
      >
        <div className="rounded-2xl border border-gray-200/70 bg-white p-3">
          <ActionForm action={createRoomBlock} submitLabel="구간 추가">
            <div>
              <label className={label}>공간 *</label>
              <select name="roomId" required className={input}>
                <option value="">선택</option>
                {rooms
                  .filter((r) => r.status === "active")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={label}>날짜 *</label>
              <input name="date" type="date" required className={input} />
            </div>
            <div>
              <label className={label}>시작 *</label>
              <input name="startTime" type="time" required className={input} />
            </div>
            <div>
              <label className={label}>종료 *</label>
              <input name="endTime" type="time" required className={input} />
            </div>
            <div>
              <label className={label}>사유</label>
              <input name="reason" className={`${input} w-32`} placeholder="시설 점검" />
            </div>
          </ActionForm>
        </div>

        <ul className="space-y-1.5">
          {roomBlocks.map((b) => (
            <Row key={b.id}>
              <span className="text-xs text-gray-700">
                <b>{roomName(b.room_id)}</b> · {b.date} ·{" "}
                {b.start_time.slice(0, 5)}~{b.end_time.slice(0, 5)}
                {b.reason ? ` · ${b.reason}` : ""}
              </span>
              <form action={deleteRoomBlock}>
                <input type="hidden" name="id" value={b.id} />
                <button
                  type="submit"
                  className="text-xs text-gray-400 hover:text-red-500 hover:underline"
                >
                  삭제
                </button>
              </form>
            </Row>
          ))}
          {!roomBlocks.length && (
            <p className="text-sm text-gray-400">등록된 구간이 없습니다.</p>
          )}
        </ul>
      </Section>
    </div>
  );
}
