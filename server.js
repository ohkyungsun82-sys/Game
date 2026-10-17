const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persistent database file for Render deployment
const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Error loading DB:', e);
    }
    return { users: [], rooms: [] };
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving DB:', e);
    }
}

// Initialize DB on startup
let db = loadDB();
// Reset any active room states from previous server restarts
db.rooms.forEach(r => {
    r.status = 'waiting';
    r.players = r.players.slice(0, 1); // keep host only or clear
});
saveDB(db);

// Dictionary for server-side word validation
const topicDictionary = {
    "동물": ["사자", "호랑이", "코끼리", "기린", "원숭이", "토끼", "강아지", "고양이", "햄스터", "다람쥐", "여우", "늑대", "곰", "판다", "치타", "얼룩말", "하마", "코뿔소", "캥거루", "타조", "독수리", "참새", "펭귄", "돌고래", "상어", "고래", "문어", "오징어", "거북이", "악어"],
    "음식": ["사과", "바나나", "포도", "딸기", "수박", "피자", "치킨", "햄버거", "라면", "김치", "불고기", "떡볶이", "초밥", "파스타", "샐러드", "아이스크림", "케이크", "초콜릿", "만두", "된장찌개", "김밥", "오므라이스", "카레", "빵", "우유", "커피", "주스", "삼겹살", "냉면", "짬뽕"],
    "국가/도시": ["대한민국", "미국", "일본", "중국", "영국", "프랑스", "독일", "이탈리아", "캐나다", "호주", "브라질", "스페인", "스위스", "베트남", "태국", "서울", "도쿄", "뉴욕", "파리", "런던", "베이징", "시드니", "로마", "싱가포르", "방콕", "토론토", "바르셀로나", "홍콩", "베를린", "모스크바"],
    "직업": ["의사", "간호사", "경찰관", "소방관", "요리사", "선생님", "프로그래머", "디자이너", "가수", "배우", "운동선수", "변호사", "판사", "과학자", "우주인", "작가", "화가", "건축가", "기자", "파일럿", "승무원", "군인", "농부", "어부", "제빵사", "바리스타", "유튜버", "경찰", "소방대원", "교수"],
    "영화/애니": ["겨울왕국", "아바타", "타이타닉", "어벤져스", "인셉션", "인터스텔라", "토이스토리", "스파이더맨", "배트맨", "해리포터", "반지의제왕", "슈렉", "미니언즈", "포켓몬", "슬램덩크", "원피스", "나루토", "진격의거인", "주술회전", "귀멸의칼날", "명탐정코난", "센과치히로", "토토로", "겨울왕국2", "알라딘", "라이온킹", "모아나", "코코", "인사이드아웃", "UP"],
    "브랜드/물건": ["나이키", "아디다스", "삼성", "애플", "LG", "스타벅스", "맥도날드", "테슬라", "소니", "닌텐도", "스마트폰", "컴퓨터", "노트북", "키보드", "마우스", "모니터", "이어폰", "책상", "의자", "냉장고", "세탁기", "청소기", "에어컨", "선풍기", "시계", "안경", "가방", "지갑", "텀블러", "우산"]
};

const activeGames = {}; // roomId -> interval timer object

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Auth: Register
    socket.on('auth:register', ({ nickname, username, password }, callback) => {
        db = loadDB();
        if (db.users.some(u => u.username === username)) {
            return callback({ success: false, message: '이미 존재하는 아이디입니다.' });
        }
        const newUser = {
            id: 'user_' + Date.now() + Math.random().toString(36).substr(2, 5),
            nickname,
            username,
            password,
            wins: 0,
            losses: 0
        };
        db.users.push(newUser);
        saveDB(db);
        callback({ success: true, user: newUser });
    });

    // Auth: Login
    socket.on('auth:login', ({ username, password }, callback) => {
        db = loadDB();
        const user = db.users.find(u => u.username === username && u.password === password);
        if (!user) {
            return callback({ success: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
        }
        callback({ success: true, user });
    });

    // Room: List rooms
    socket.on('room:list', (callback) => {
        db = loadDB();
        callback(db.rooms);
    });

    // Room: Create room
    socket.on('room:create', ({ title, topic, user }, callback) => {
        db = loadDB();
        const newRoom = {
            id: 'room_' + Date.now(),
            title,
            topic,
            host: user.id,
            players: [user],
            status: 'waiting', // waiting, playing, finished
            gameState: null
        };
        db.rooms.push(newRoom);
        saveDB(db);
        io.emit('rooms:updated', db.rooms);
        callback({ success: true, room: newRoom });
    });

    // Room: Join room
    socket.on('room:join', ({ roomId, user }, callback) => {
        db = loadDB();
        const room = db.rooms.find(r => r.id === roomId);
        if (!room) return callback({ success: false, message: '존재하지 않는 방입니다.' });
        if (room.status !== 'waiting') return callback({ success: false, message: '이미 게임이 시작된 방입니다.' });
        
        if (!room.players.some(p => p.id === user.id)) {
            if (room.players.length >= 2) return callback({ success: false, message: '방이 가득 찼습니다.' });
            room.players.push(user);
            saveDB(db);
        }

        socket.join(roomId);
        io.emit('rooms:updated', db.rooms);
        io.to(roomId).emit('room:updated', room);
        callback({ success: true, room });
    });

    // Room: Add Bot
    socket.on('room:add-bot', ({ roomId }, callback) => {
        db = loadDB();
        const room = db.rooms.find(r => r.id === roomId);
        if (!room) return callback({ success: false, message: '방을 찾을 수 없습니다.' });

        const botNames = ['단어고수봇', '타자왕봇', 'AI챔피언', '스피드왕봇'];
        const randomName = botNames[Math.floor(Math.random() * botNames.length)] + ' 🤖';
        const botUser = {
            id: 'bot_' + Date.now(),
            nickname: randomName,
            username: 'bot_' + Math.random(),
            isBot: true
        };

        room.players.push(botUser);
        saveDB(db);
        io.to(roomId).emit('room:updated', room);
        io.emit('rooms:updated', db.rooms);
        callback({ success: true, room });
    });

    // Room: Leave room
    socket.on('room:leave', ({ roomId, user }) => {
        db = loadDB();
        const roomIdx = db.rooms.findIndex(r => r.id === roomId);
        if (roomIdx !== -1) {
            const room = db.rooms[roomIdx];
            room.players = room.players.filter(p => p.id !== user.id);
            if (room.players.length === 0) {
                db.rooms.splice(roomIdx, 1);
                if (activeGames[roomId]) {
                    clearInterval(activeGames[roomId]);
                    delete activeGames[roomId];
                }
            } else {
                if (room.host === user.id) {
                    room.host = room.players[0].id;
                }
                io.to(roomId).emit('room:updated', room);
            }
            saveDB(db);
            io.emit('rooms:updated', db.rooms);
        }
        socket.leave(roomId);
    });

    // Game: Start game
    socket.on('game:start', ({ roomId }) => {
        db = loadDB();
        const room = db.rooms.find(r => r.id === roomId);
        if (!room || room.players.length < 2) return;

        room.status = 'playing';
        room.gameState = {
            topic: room.topic,
            timeRemaining: 30,
            isOvertime: false,
            overtimeAdded: false,
            p1: room.players[0],
            p2: room.players[1],
            scores: {
                [room.players[0].id]: 0,
                [room.players[1].id]: 0
            },
            words: {
                [room.players[0].id]: [],
                [room.players[1].id]: []
            }
        };
        saveDB(db);
        io.emit('rooms:updated', db.rooms);
        io.to(roomId).emit('game:started', room.gameState);

        // Start server-side game interval loop
        if (activeGames[roomId]) clearInterval(activeGames[roomId]);

        activeGames[roomId] = setInterval(() => {
            let currentDb = loadDB();
            let currRoom = currentDb.rooms.find(r => r.id === roomId);
            if (!currRoom || currRoom.status !== 'playing') {
                clearInterval(activeGames[roomId]);
                delete activeGames[roomId];
                return;
            }

            let state = currRoom.gameState;
            state.timeRemaining -= 1;

            // Bot simulation logic if p2 is bot
            if (state.p2.isBot && Math.random() < 0.55) {
                const dict = topicDictionary[state.topic] || topicDictionary["동물"];
                const botWords = state.words[state.p2.id] || [];
                const available = dict.filter(w => !botWords.includes(w));
                if (available.length > 0) {
                    const chosen = available[Math.floor(Math.random() * available.length)];
                    botWords.push(chosen);
                    state.scores[state.p2.id] += 5;
                }
            }

            if (state.timeRemaining <= 0) {
                const s1 = state.scores[state.p1.id];
                const s2 = state.scores[state.p2.id];

                if (s1 === s2 && !state.overtimeAdded) {
                    state.timeRemaining = 10;
                    state.isOvertime = true;
                    state.overtimeAdded = true;
                    io.to(roomId).emit('game:overtime', state);
                } else {
                    currRoom.status = 'finished';
                    clearInterval(activeGames[roomId]);
                    delete activeGames[roomId];

                    // Update user win/loss statistics in DB
                    const winnerId = s1 > s2 ? state.p1.id : (s2 > s1 ? state.p2.id : null);
                    currentDb.users.forEach(u => {
                        if (u.id === state.p1.id || u.id === state.p2.id) {
                            if (!u.wins) u.wins = 0;
                            if (!u.losses) u.losses = 0;
                            if (u.id === winnerId) u.wins += 1;
                            else if (winnerId && u.id !== winnerId) u.losses += 1;
                        }
                    });

                    saveDB(currentDb);
                    io.to(roomId).emit('game:ended', { gameState: state, winnerId });
                    io.emit('rooms:updated', currentDb.rooms);
                    return;
                }
            }

            saveDB(currentDb);
            io.to(roomId).emit('game:tick', state);
        }, 1000);
    });

    // Game: Submit word
    socket.on('game:submit-word', ({ roomId, userId, word }) => {
        db = loadDB();
        const room = db.rooms.find(r => r.id === roomId);
        if (!room || room.status !== 'playing' || !room.gameState) return;

        const state = room.gameState;
        const dict = topicDictionary[state.topic] || [];
        const userWords = state.words[userId] || [];

        if (userWords.includes(word)) return;
        if (!dict.includes(word)) return; // Invalid word

        userWords.push(word);
        state.scores[userId] = (state.scores[userId] || 0) + 5;
        saveDB(db);

        io.to(roomId).emit('game:word-accepted', { userId, word, scores: state.scores, words: state.words });
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Word Battle Arena server running on port ${PORT}`);
});
