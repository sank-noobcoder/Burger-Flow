import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker
from apps.api.app.core.config import settings

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), default="researcher")  # researcher, reviewer, admin
    status = Column(String(50), default="active")  # active, blocked
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    runs = relationship("Run", back_populates="user", cascade="all, delete-orphan")
    quota = relationship("Quota", back_populates="user", uselist=False, cascade="all, delete-orphan")


class Quota(Base):
    __tablename__ = "quotas"
    
    user_id = Column(String(36), ForeignKey("users.id"), primary_key=True)
    gpu_min_limit = Column(Integer, default=120)
    gpu_min_used = Column(Float, default=0.0)
    max_active_jobs = Column(Integer, default=2)
    resets_at = Column(DateTime, default=lambda: datetime.datetime.utcnow() + datetime.timedelta(days=30))
    
    user = relationship("User", back_populates="quota")


class Run(Base):
    __tablename__ = "runs"
    
    id = Column(String(36), primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    dimension = Column(Integer, default=1)  # 1 or 2
    model_type = Column(String(50), default="ri")  # ri, ff, n
    status = Column(String(50), default="queued")  # queued, running, cancelling, cancelled, succeeded, failed
    phase = Column(String(50), default="search")  # search, finetune
    progress = Column(Float, default=0.0)  # 0.0 to 100.0
    config_json = Column(Text, nullable=False)
    seed = Column(Integer, default=0)
    
    best_loss = Column(Float, nullable=True)
    final_l2 = Column(Float, nullable=True)
    mse = Column(Float, nullable=True)
    shock_pos_err = Column(Float, nullable=True)
    epochs = Column(Integer, default=0)
    wall_clock_s = Column(Float, default=0.0)
    
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    finished_at = Column(DateTime, nullable=True)
    
    user = relationship("User", back_populates="runs")
    metrics = relationship("RunMetric", back_populates="run", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="run", cascade="all, delete-orphan")


class RunMetric(Base):
    __tablename__ = "run_metrics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(String(36), ForeignKey("runs.id"), index=True, nullable=False)
    epoch = Column(Integer, nullable=False)
    loss = Column(Float, nullable=False)
    best_loss = Column(Float, nullable=True)
    patience = Column(Integer, default=0)
    phase = Column(String(50), default="search")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    run = relationship("Run", back_populates="metrics")


class Artifact(Base):
    __tablename__ = "artifacts"
    
    id = Column(String(36), primary_key=True)
    run_id = Column(String(36), ForeignKey("runs.id"), index=True, nullable=False)
    name = Column(String(255), nullable=False)  # config.yaml, prediction_final.bin, regions.json, pca.json, etc.
    file_path = Column(String(512), nullable=False)
    size_bytes = Column(Integer, default=0)
    content_type = Column(String(100), default="application/octet-stream")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    run = relationship("Run", back_populates="artifacts")


class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    ip = Column(String(45), nullable=True)
    detail = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# Engine and Session setup
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
