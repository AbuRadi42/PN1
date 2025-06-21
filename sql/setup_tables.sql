-- Create Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Subscriptions Table
CREATE TABLE subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    is_active BOOLEAN DEFAULT FALSE,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    payment_status VARCHAR(50),
    payment_reference VARCHAR(255)
);

-- Create Videos Table
CREATE TABLE videos (
    video_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id),
    video_path VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    watermark_removed BOOLEAN DEFAULT FALSE
);

-- Create Frames Table
CREATE TABLE frames (
    frame_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(video_id),
    frame_path VARCHAR(255) NOT NULL,
    timestamp FLOAT NOT NULL,
    emotion VARCHAR(50)
);

-- Create Audio Clips Table
CREATE TABLE audio_clips (
    audio_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id UUID REFERENCES videos(video_id),
    audio_path VARCHAR(255) NOT NULL,
    emotion VARCHAR(50)
);
