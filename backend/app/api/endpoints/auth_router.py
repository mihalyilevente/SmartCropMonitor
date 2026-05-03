from fastapi import HTTPException, Depends, APIRouter

from sqlalchemy.orm import Session

from app.core.database import UserDB, UserCreate, get_db


router = APIRouter()


@router.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):

    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()

    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    new_user = UserDB(username=user.username, hashed_password=user.password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"status": "user created", "username": new_user.username}


@router.post("/login")
async def login(user: UserCreate, db: Session = Depends(get_db)):

    db_user = db.query(UserDB).filter(UserDB.username == user.username).first()

    if not db_user or db_user.hashed_password != user.password:
        raise HTTPException(status_code=400, detail="Invalid username or password")

    return {"status": "login success", "user_id": db_user.id}
