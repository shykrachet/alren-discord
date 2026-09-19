# คู่มือแก้ `DiscordjsError [TokenInvalid]` สำหรับ Alren

ข้อผิดพลาดนี้หมายความว่า Discord ไม่ยอมรับ Bot Token ที่อยู่ใน `DISCORD_TOKEN` โดยมักเกิดจาก token ถูก Reset ไปแล้ว, คัดลอกค่าไม่ครบ หรือใช้ Client Secret แทน Bot Token

> Bot Token เปรียบเสมือนรหัสผ่านของบอท ห้ามส่งใน Discord, แชต, GitHub หรือภาพหน้าจอ

## 1. สร้าง Bot Token ใหม่

1. เปิด [Discord Developer Portal](https://discord.com/developers/applications)
2. เลือกแอป **alren**
3. เปิดเมนู **Bot** ทางซ้าย
4. กด **Reset Token**
5. ยืนยันรหัสผ่านหรือ 2FA ตามที่ Discord ขอ
6. กด **Copy** และเก็บ token ไว้ชั่วคราวในที่ปลอดภัย

เมื่อ Reset แล้ว token เก่าจะใช้ไม่ได้ทันที จึงต้องอัปเดตทั้งเครื่องและ Railway

## 2. อัปเดต `.env` บนเครื่อง

เปิดไฟล์:

```text
D:\github\alren-discord\.env
```

แก้เฉพาะบรรทัดนี้:

```env
DISCORD_TOKEN=วาง_bot_token_ใหม่ตรงนี้
```

ตรวจให้แน่ใจว่า:

- ไม่มีคำว่า `Bot ` อยู่ข้างหน้า token
- ไม่มีเครื่องหมายคำพูดครอบค่า
- ไม่มีช่องว่างก่อนหรือหลัง token
- ใช้ **Bot Token** จากหน้า Bot ไม่ใช่ Client ID หรือ Client Secret
- บันทึกไฟล์ `.env` แล้ว

## 3. ทดสอบบนเครื่อง

เปิด PowerShell ในโฟลเดอร์โปรเจกต์แล้วรัน:

```powershell
cd D:\github\alren-discord
npm start
```

หากสำเร็จ ควรเห็น log คล้ายข้อความต่อไปนี้:

```text
online: Alren-Bot#....
registered ... global slash command(s) ...
HTTP API listening on port 3000
```

หมายเลขพอร์ตอาจต่างกันได้ หากต้องการหยุดบอทให้กด `Ctrl+C`

## 4. อัปเดต Token บน Railway

ถ้ารันบอทบน Railway ต้องอัปเดต token ที่นั่นด้วย:

1. เปิดโปรเจกต์ Alren ใน Railway
2. เลือก service ที่รันบอท
3. เปิดแท็บ **Variables**
4. หา `DISCORD_TOKEN`
5. แทนที่ค่าด้วย Bot Token ใหม่
6. กดบันทึก
7. เปิดหน้า Deployments แล้วกด **Redeploy** หรือ **Restart**

ไม่ต้องสร้างตัวแปร `PORT` เอง เพราะ Railway กำหนดให้อัตโนมัติ

## 5. ตรวจสอบใน Discord

1. รอให้ Alren แสดงสถานะออนไลน์
2. ลองใช้ `/ping`
3. ลองใช้ `!ping`
4. ถ้า slash command ยังไม่แสดง ให้กด `Ctrl+R` เพื่อรีโหลด Discord แล้วรอสักครู่

ลิงก์เชิญบอท Alren แบบ Administrator พร้อม slash commands:

```text
https://discord.com/oauth2/authorize?client_id=1550542538497335336&permissions=8&integration_type=0&scope=bot%20applications.commands
```

## ถ้ายังขึ้น `TokenInvalid`

- Reset Token ใหม่อีกครั้ง แล้วคัดลอกค่าล่าสุดทันที
- ตรวจว่าแก้ไฟล์ `.env` ใน `D:\github\alren-discord` จริง
- ปิด process เก่าด้วย `Ctrl+C` ก่อนรัน `npm start` ใหม่
- อย่าใช้ Application ID, Public Key หรือ Client Secret แทน Bot Token
- หาก token เคยปรากฏในแชต, commit หรือภาพสาธารณะ ให้ Reset ทันที

ข้อความ `Assertion failed: ... UV_HANDLE_CLOSING` ที่อาจปรากฏหลัง `TokenInvalid` เป็นผลตามหลังการเชื่อมต่อล้มเหลว ไม่ใช่ต้นเหตุหลัก
