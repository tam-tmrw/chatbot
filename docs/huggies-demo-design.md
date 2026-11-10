# Huggies pitch demo — Design

**Status:** Design validated (brainstorming lock)  
**Date:** 2026-11-09  
**Approach:** Module Huggies riêng trong app Next.js hiện tại. Session trong bộ nhớ. Hyundai giữ engine cũ, chỉ thêm cổng mã.

Source spec: Huggies Zalo OA pitch. Bản này là lát demo đã chốt, không phải full spec.

---

## 1. Understanding summary

- **What:** Trang `/huggies` mô phỏng chat thu thập thông tin bé rồi trả link video. Control trên trang chọn `success`, `error_photo_invalid`, `error_render`, và `ai` on/off. Ảnh qua Amazon Rekognition. Video success là một URL random từ list S3.
- **Why:** Pitch cho client thấy flow cứng và flow có AI, kể cả lỗi ảnh và lỗi render, mà không render video thật.
- **Who:** Người pitch và client trong buổi demo. Hyundai tại `/` vẫn là demo lead hiện tại.
- **Constraints:** Cùng repo Next.js. Mã 6 ký tự mỗi demo, cookie đến khi đóng trình duyệt. QC: đúng 1 mặt, không người thứ hai, đủ chất lượng. Không kiểm tra nhãn Baby hay độ tuổi. Ảnh không lưu, không đưa vào LLM.
- **Non-goals:** Timeout scenario, `error_system` như một scenario, restart/help/off-topic toàn cục, đổi `ai` giữa session, Zalo OA, face-swap, ticket CS, lưu ảnh.

---

## 2. Assumptions

| ID | Assumption |
|----|------------|
| A1 | Phòng pitch, vài session cùng lúc. Không nhằm traffic production. |
| A2 | AI quá 2 giây thì copy cứng của bước hiện tại. Chờ job khoảng 3 giây, không có control delay. |
| A3 | Mã là cổng demo, không phải IAM. Cookie httpOnly, session cookie, mỗi demo một cookie. Trang và API của demo đó kiểm tra cookie. ManyChat và admin giữ secret hiện tại. |
| A4 | File ảnh lên server chỉ để gọi Rekognition, rồi xóa bytes. Browser có thể hiện preview cục bộ. |
| A5 | Ngưỡng QC (confidence, sáng, nét, góc mặt, cạnh ảnh, 5MB) là hằng số trong một file. |
| A6 | `error_photo_invalid` vẫn gọi Rekognition. Ảnh fail thì dùng lý do thật. Ảnh pass thì fail với lý do giả xoay vòng. |
| A7 | Một URL preview chung, tùy chọn trong env. Không có thì result chỉ có link video. |
| A8 | List video S3 là một list dùng chung trong env. Random một lần lúc job `success` xong, giữ trong session. |
| A9 | Đổi scenario hoặc `ai` trên control tạo session mới. |
| A10 | Restart process xóa mọi session Huggies. |
| A11 | Nút CS chỉ là lời thoại. Không có ticket. |
| A12 | `error_render` thử lại tối đa 2 lần, lần nào cũng lỗi theo scenario. |

---

## 3. Decision log

| # | Decision | Alternatives considered | Why |
|---|----------|-------------------------|-----|
| 1 | Demo mức pitch: happy path `ai=on` và `ai=off`, cộng hai scenario lỗi | Đủ 12 acceptance test; chỉ `ai=off` | Đủ hai tier và hai lỗi có kiểm soát |
| 2 | Một trang `/huggies`, control trên trang | Query string như spec; cả URL lẫn control | Đổi kịch bản không cần sửa URL |
| 3 | File picker thật, Rekognition kiểm tra ảnh | QC chỉ theo scenario; nút gửi ảnh giả | Client thấy bước gửi ảnh, và có chặn ảnh sai |
| 4 | Video success = random một URL S3, giữ cố định cho session | Random mỗi lần hiện; list theo hobby | Refresh giữa pitch không đổi video |
| 5 | Mã 6 ký tự, cookie đến khi đóng trình duyệt | `sessionStorage` mỗi tab; hỏi mỗi lần tải | Mở lại tab trong cùng trình duyệt không nhập lại |
| 6 | Luôn gọi Rekognition; `error_photo_invalid` vẫn ép fail | Chỉ QC thật; scenario lỗi thì bỏ qua AWS | Pitch được lỗi ảnh dù ảnh trên sân khấu đạt |
| 7 | Pass khi 1 mặt, không người khác, đủ chất lượng | Bắt nhãn Baby; khớp độ tuổi đã chọn | Rule đã chốt cho buổi pitch |
| 8 | Module Huggies riêng, session trong `Map` | MySQL JSON; nhét vào engine Hyundai | Đủ cho pitch, Hyundai đứng yên |
| 9 | Một session, một job, video random lúc job xong | Job mới mỗi lần bấm xác nhận | Tránh hai video cho cùng một lượt |
| 10 | AWS lỗi không tính 3 lần fail ảnh; render thử lại tối đa 2 lần | Tính mọi lỗi vào 3 lần; thử lại không giới hạn | Pitch không kẹt vì AWS, lỗi render có điểm dừng |
| 11 | Test Vitest inject QC và LLM, không gọi AWS/OpenAI | E2E trình duyệt trong lát đầu | Máy trạng thái kiểm được mà không tốn API |

---

## 4. Final design

### 4.1 Architecture

Hyundai giữ `handleTurn`, prompt và bảng lead. `/` và `/c/[sessionId]` chỉ thêm kiểm tra cookie mã Hyundai.

- `lib/demo-access` phát cookie. Env: mã Hyundai, mã Huggies, mỗi mã đúng 6 ký tự.
- `/huggies`: UI chat mới (nút, ô nhập, file picker, control scenario và `ai`).
- `/api/huggies/session`, `/api/huggies/message`, poll job. State machine trong `lib/huggies`.
- Session là object trong `Map` trên server. Client giữ session id.
- `ai=on` dùng client LLM hiện có, timeout 2 giây, JSON `{ fields, reply }`. Code validate enum rồi mới đổi bước. `ai=off` không gọi LLM.
- Ảnh: `DetectFaces` cộng đếm người. Pass khi đúng 1 mặt, confidence đủ, đủ sáng, đủ nét, nhìn gần thẳng, không che, cạnh đủ lớn, không thấy người thứ hai.

### 4.2 Session và luồng

Session giữ bước, `scenario`, `ai`, field đã thu (consent, tên bé, tên trên video, giới tính, tuổi, sở thích, cờ đã có ảnh), số lần ảnh fail, và job (`job_id`, status, `video_url`, `error_code`). Không giữ bytes ảnh.

Bước: `welcome` → `consent` → `baby_name` → `display_name` → `gender` → `age_range` → `hobby` → `photo` → `confirm` → `processing` → `result` hoặc `error`.

Nút và gõ số cùng tồn tại. `ai=on` được điền nhiều field một câu, rồi nhảy tới bước còn thiếu. Enum sai thì hỏi lại bước đó.

`confirm` tạo một `job_id`. Xác nhận lần nữa không tạo job mới. Server chờ khoảng 3 giây. UI poll tới khi xong.

`success` random URL lúc job xong. `error_render` trả `render_fail`. `error_photo_invalid` không tạo job. Result có link video, preview nếu có env, nút Chia sẻ, Làm lại, Tìm hiểu Huggies. Làm lại là session mới.

### 4.3 Lỗi và biên

- Mã sai: ở lại màn nhập, không cookie. API thiếu cookie đúng demo: 401.
- LLM timeout hoặc JSON hỏng: copy cứng, không đổi bước.
- File không phải ảnh hoặc trên 5MB: tính một lần fail. Ảnh ngoài bước photo: nhắc câu đang hỏi, không QC. Chữ ở bước ảnh: nhắc gửi ảnh, không tính fail.
- AWS/Rekognition lỗi: xin gửi lại, không tăng số fail, vẫn xóa bytes.
- Fail thật và fail ép tính vào 3 lần. Đủ 3 lần: bubble CS, không job.
- List S3 trống: bubble lỗi demo, không stack, không URL.
- `error_render`: tối đa 2 lần thử lại, lần nào cũng lỗi. Sau đó còn CS và Kết thúc.
- `processing`: chữ người dùng chỉ nhận “đang xử lý”. Không sửa field, không job mới.
- Thiếu field tại confirm: ở lại bước còn thiếu.

### 4.4 Tests

Vitest, inject QC và LLM.

- `ai=off` đi từ `welcome` tới `confirm` bằng nút hoặc số.
- `ai=on` một câu nhiều field nhảy đúng bước. JSON hỏng thì đứng yên.
- Ảnh pass + `success`: một `job_id`, URL cố định sau 3 giây.
- Ảnh pass + `error_photo_invalid`: fail giả, đủ 3 lần thì CS, không job.
- QC `multi_face` hoặc mờ: lý do thật, có đếm.
- QC ném lỗi AWS: không tăng số fail.
- `error_render`: hai lần thử lại vẫn lỗi, lần sau không còn nút Thử lại.
- List S3 trống: không URL.
- Hàm cổng mã: so khớp và phát cookie.

Kiểm tra UI bằng tay trên `/huggies` và `/` khi implement: cổng, nút, file picker, link video.

---

## 5. Risks

- Rekognition có thể loại ảnh pitch hợp lệ (ngược sáng, hai mặt trong khung, em bé nghiêng). Ngưỡng nằm một chỗ để chỉnh trong buổi rehearsal.
- Session trong RAM mất khi restart process giữa pitch. Cách xử lý: chơi lại. Nâng cấp sau là một bảng JSON nếu cần sống qua restart.
- Mã 6 ký tự là cổng demo. Cookie ăn cắp trong cùng trình duyệt thì mở được demo đến khi đóng browser.
- List S3 sai quyền đọc thì job `success` vẫn trả URL nhưng client không xem được. Cần URL public hoặc signed, thống nhất trước buổi pitch.

---

## 6. Out of scope

- Scenario `timeout` và `error_system`.
- Restart, help, off-topic ở mọi bước. Đổi `ai` giữa session.
- Nhãn Baby, suy tuổi hoặc giới tính từ ảnh.
- Lưu ảnh, face-swap, Zalo OA, ticket CS, CRM.
- Migration MySQL cho session Huggies.
- Sửa flow lead Hyundai ngoài cổng mã.
