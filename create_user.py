"""
create_user.py
유저(초대 코드) 생성 스크립트
사용법: python create_user.py
"""

import secrets
from database import init_db, SessionLocal, User

def create_user(name: str, invite_code: str | None = None) -> User:
    init_db()
    db = SessionLocal()

    code = invite_code or secrets.token_urlsafe(8)  # 랜덤 코드 자동 생성
    user = User(name=name, invite_code=code)
    db.add(user)
    db.commit()
    db.refresh(user)

    print(f"✅ 유저 생성 완료")
    print(f"   이름: {user.name}")
    print(f"   초대 코드: {user.invite_code}")
    print(f"   → 이 코드를 앱에서 입력하면 로그인됩니다")
    db.close()
    return user

if __name__ == "__main__":
    name = input("유저 이름 입력: ")
    code = input("초대 코드 입력 (엔터치면 자동 생성): ").strip() or None
    create_user(name, code)