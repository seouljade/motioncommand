/* MotionCommand 설정
 * Supabase를 연결하면 훈련 기록이 공유 저장소에 모여 교관이 여러 기기의 기록을 함께 볼 수 있습니다.
 * 비워두면 기록은 이 브라우저(기기)에만 저장되고, CSV로 내보내 교관에게 제출할 수 있습니다.
 *
 * Supabase 대시보드 → Project Settings → API 에서 복사:
 *   SUPABASE_URL      : Project URL (https://xxxx.supabase.co)
 *   SUPABASE_ANON_KEY : anon public key (공개용 키. service_role 키는 절대 넣지 마세요)
 */
window.MC_CONFIG = {
  SUPABASE_URL: 'https://cddqoefwsiiepfjsgyuo.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkZHFvZWZ3c2lpZXBmanNneXVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM3MDMwMTIsImV4cCI6MjEwOTI3OTAxMn0.H0HWMNR2KM-s16oWmkmlR9xwO-2zBvR4SOwKUzydmIk',
  TABLE: 'mc_attempts',

  // 손 인식 모델 (MediaPipe Tasks Vision)
  MP_VERSION: '0.10.14',
  MP_MODEL: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
};
