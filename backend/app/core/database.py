from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic import BaseModel

SQLALCHEMY_DATABASE_URL = "sqlite:///./users.db"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class UserDB(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

Base.metadata.create_all(bind=engine)

class UserCreate(BaseModel):
    username: str
    password: str

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()