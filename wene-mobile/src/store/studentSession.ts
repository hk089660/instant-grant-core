/**
 * 生徒セッションは utils/studentSession を唯一の実装とする。ここは re-export のみ。
 */
export {
  getStudentSession,
  setStudentSession,
  clearStudentSession,
  type StudentSession,
} from '../utils/studentSession';
