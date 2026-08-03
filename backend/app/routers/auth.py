from fastapi import APIRouter, Depends, HTTPException, status, Response
from app.schemas.auth import UserRegister, UserLogin, TokenResponse, UserResponse
from app.core.security import get_password_hash, verify_password, create_access_token, get_current_user
from app.database import get_database
import uuid

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse)
async def register(user_in: UserRegister, response: Response):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection to MongoDB is currently unavailable.",
        )

    # Check existing user
    existing = await db.users.find_one({"email": user_in.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists.",
        )

    user_id = f"usr_{uuid.uuid4().hex[:10]}"
    hashed_pwd = get_password_hash(user_in.password)
    user_doc = {
        "_id": user_id,
        "id": user_id,
        "email": user_in.email,
        "name": user_in.name,
        "hashed_password": hashed_pwd,
    }

    await db.users.insert_one(user_doc)

    # Create JWT Access Token
    token = create_access_token({"sub": user_id, "email": user_in.email, "name": user_in.name})

    # Set HttpOnly Cookie for secure browser sessions
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_id, "email": user_in.email, "name": user_in.name},
    }

@router.post("/login", response_model=TokenResponse)
async def login(user_in: UserLogin, response: Response):
    db = get_database()
    if db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection to MongoDB is currently unavailable.",
        )

    user_doc = await db.users.find_one({"email": user_in.email})

    if not user_doc or not verify_password(user_in.password, user_doc["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    token = create_access_token({
        "sub": user_doc["id"],
        "email": user_doc["email"],
        "name": user_doc["name"]
    })

    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user_doc["id"], "email": user_doc["email"], "name": user_doc["name"]},
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return current_user

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {"message": "Successfully logged out."}
