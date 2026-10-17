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
  "동물": [
    "사자", "호랑이", "코끼리", "기린", "원숭이", "토끼", "강아지", "고양이", "햄스터", "다람쥐", 
    "여우", "늑대", "곰", "판다", "치타", "얼룩말", "하마", "코뿔소", "캥거루", "타조", 
    "독수리", "참새", "펭귄", "돌고래", "상어", "고래", "문어", "오징어", "거북이", "악어",
    "표범", "재규어", "하이에나", "스컹크", "너구리", "오줌싸개너구리", "미국너구리", "코알라", "나무늘보", "침팬지",
    "오랑우탄", "고릴라", "개비", "미어캣", "사막여우", "수달", "해달", "물개", "바다사자", "바다코끼리",
    "고슴도치", "두더지", "박쥐", "날다람쥐", "청설모", "족제비", "담비", "오수리", "스라소니", "퓨마",
    "순록", "엘크", "무스", "고라니", "노루", "사슴", "멧돼지", "반달가슴곰", "불곰", "북극곰",
    "나무늘보", "아르마딜로", "개미핥기", "오리너구리", "바늘두더지", "캥거루쥐", "쿼카", "왈라비", "타즈매니아데빌", "웜뱃",
    "카멜레온", "이구아나", "도마뱀", "뱀", "구렁이", "살모사", "코브라", "아나콘다", "비단뱀", "방울뱀",
    "개구리", "두꺼비", "도롱뇽", "장수지렁이", "달팽이", "민달팽이", "지렁이", "거미", "전갈", "지네",
    "매", "부엉이", "올빼미", "까마귀", "까치", "비둘기", "제비", "참새", "딱따구리", "앵무새",
    "공작", "타조", "에뮤", "카이수아", "홍학", "백조", "오리", "거위", "펠리컨", "갈매기",
    "참치", "연어", "송어", "잉어", "붕어", "금붕어", "상어", "가오리", "해파리", "불가사리",
    "성게", "해삼", "소라", "전복", "조개", "홍합", "굴", "새우", "게", "랍스터",
    "사마귀", "메뚜기", "여치", "매미", "잠자리", "나비", "나방", "꿀벌", "말벌", "개미"],
  "음식": [
    "사과", "바나나", "포도", "딸기", "수박", "피자", "치킨", "햄버거", "라면", "김치", 
    "불고기", "떡볶이", "초밥", "파스타", "샐러드", "아이스크림", "케이크", "초콜릿", "만두", "된장찌개", 
    "김밥", "오므라이스", "카레", "빵", "우유", "커피", "주스", "삼겹살", "냉면", "짬뽕",
    "참외", "복숭아", "자두", "귤", "오렌지", "레몬", "키위", "파인애플", "망고", "블루베리",
    "토마토", "오이", "당근", "양파", "감자", "고구마", "브로콜리", "시금치", "상추", "깻잎",
    "제육볶음", "갈비찜", "닭갈비", "순대국", "설렁탕", "곰탕", "육개장", "부대찌개", "김치찌개", "청국장",
    "짜장면", "탕수육", "양장피", "팔보채", "우동", "소바", "돈카츠", "규동", "텐동", "타코야키",
    "스테이크", "리조또", "뇨끼", "라자냐", "타코", "부리또", "퀘사디아", "샌드위치", "핫도그", "팬케이크",
    "와플", "마카롱", "푸딩", "빙수", "식혜", "수정과", "녹차", "홍차", "에이드", "스무디",
    "떡국", "만둣국", "칼국수", "수제비", "잔치국수", "비빔국수", "잡채", "전", "빈대떡", "족발"],
  "국가/도시": [
    "대한민국", "미국", "일본", "중국", "영국", "프랑스", "독일", "이탈리아", "캐나다", "호주", 
    "브라질", "스페인", "스위스", "베트남", "태국", "서울", "도쿄", "뉴욕", "파리", "런던", 
    "베이징", "시드니", "로마", "싱가포르", "방콕", "토론토", "바르셀로나", "홍콩", "베를린", "모스크바",
    "부산", "제주", "인천", "대구", "대전", "광주", "오사카", "교토", "후쿠오카", "삿포로",
    "상하이", "선전", "청두", "시안", "로스앤젤레스", "시카고", "샌프란시스코", "시애틀", "워싱턴", "밴쿠버",
    "몬트리올", "멜버른", "브리즈번", "오클랜드", "마드리드", "세비야", "밀라노", "피렌체", "베네치아", "나폴리",
    "뮌헨", "프랑크푸르트", "함부르크", "비엔나", "취리히", "제네바", "암스테르담", "브뤼셀", "스톡홀름", "코펜하겐",
    "오슬로", "헬싱키", "프라하", "부다페스트", "바르샤바", "아테네", "이스탄불", "카이로", "두바이", "도하",
    "뉴델리", "뭄바이", "방갈로르", "자카르타", "발리", "쿠알라룸푸르", "마닐라", "하노이", "호치민", "치앙마이",
    "부에노스아이레스", "산티아고", "리우데자네이루", "상파울루", "멕시코시티", "보고타", "리마", "요하네스버그", "케이프타운", "오클랜드"
  ],
  "직업": [
    "의사", "간호사", "경찰관", "소방관", "요리사", "선생님", "프로그래머", "디자이너", "가수", "배우", 
    "운동선수", "변호사", "판사", "과학자", "우주인", "작가", "화가", "건축가", "기자", "파일럿", 
    "승무원", "군인", "농부", "어부", "제빵사", "바리스타", "유튜버", "경찰", "소방대원", "교수",
    "약사", "수의사", "한의사", "치과의사", "물리치료사", "영양사", "사회복지사", "임상병리사", "방사선사", "응급구조사",
    "웹퍼블리셔", "데이터분석가", "게임개발자", "보안전문가", "시스템엔지니어", "네트워크엔지니어", "인공지능연구원", "소프트웨어엔지니어", "UIUX디자이너", "일러스트레이터",
    "건축기사", "토목기사", "전기기사", "기계기사", "화학연구원", "생명공학자", "환경공학자", "변리사", "회계사", "세무사",
    "관세사", "감정평가사", "손해사정사", "공인중개사", "법무사", "노무사", "경영컨설턴트", "마케터", "광고기획자", "PD",
    "아나운서", "기상캐스터", "쇼호스트", "영화감독", "사진작가", "웹툰작가", "번역가", "통역사", "에디터", "큐레이터",
    "패션디자이너", "인테리어디자이너", "플로리스트", "조향사", "메이크업아티스트", "헤어디자이너", "스타일리스트", "모델", "댄서", "작곡가",
    "프로골퍼", "축구선수", "야구선수", "농구선수", "수영선수", "테니스선수", "배구선수", "격투기선수", "카레이서", "지휘자",
    "공무원", "외교관", "검사", "경찰공무원", "소방공무원", "부사관", "장교", "항해사", "기관사", "정비사"
  ],
  "영화/애니": [
    "겨울왕국", "아바타", "타이타닉", "어벤져스", "인셉션", "인터스텔라", "토이스토리", "스파이더맨", "배트맨", "해리포터", 
    "반지의제왕", "슈렉", "미니언즈", "포켓몬", "슬램덩크", "원피스", "나루토", "진격의거인", "주술회전", "귀멸의칼날", 
    "명탐정코난", "센과치히로", "토토로", "겨울왕국2", "알라딘", "라이온킹", "모아나", "코코", "인사이드아웃", "UP",
    "주토피아", "라푼젤", "빅히어로", "주먹왕랄프", "모노노케히메", "하울의움직이는성", "벼랑 위의 포뇨", "원더랜드", "너의 이름은.", "날씨의 아이", 
    "스즈메의 문단속", "초속 5센티미터", "목소리의 형태", "아키라", "공각기동대", "에반게리온", "하이큐!!", "블루록", "체인소 맨", "스파이 패밀리", 
    "닥터 스트레인지", "블랙 팬서", "가디언즈 오브 갤럭시", "토르", "캡틴 아메리카", "아이언맨", "조커", "다크 나이트", "트랜스포머", "쥬라기 공원", 
    "터미네이터", "에이리언", "매트릭스", "글래디에이터", "반고흐, 세상을 붓다", "라라랜드", "위대한 쇼맨", "비긴 어게인", "레미제라블", "사운드 오브 뮤직", 
    "스타워즈", "인디아나 존스", "백 투 더 퓨처", "캐리비안의 해적", "글로리", "기생충", "올드보이", "범죄도시", "극한직업", "신과함께", 
    "파묘", "서울의 봄", "범죄도시2", "명량", "베테랑", "암살", "부산행", "택시운전사", "변호인", "관상"
  ],
  "브랜드/물건": [
    "나이키", "아디다스", "삼성", "애플", "LG", "스타벅스", "맥도날드", "테슬라", "소니", "닌텐도", 
    "스마트폰", "컴퓨터", "노트북", "키보드", "마우스", "모니터", "이어폰", "책상", "의자", "냉장고", 
    "세탁기", "청소기", "에어컨", "선풍기", "시계", "안경", "가방", "지갑", "텀블러", "우산",
    "현대", "기아", "BMW", "벤츠", "아우디", "포르쉐", "구찌", "샤넬", "루이비통", "프라다",
    "에르메스", "롤렉스", "오메가", "다이슨", "샤오미", "이케아", "다이소", "올리브영", "롯데리아", "버거킹",
    "태블릿", "스마트워치", "헤드폰", "스피커", "마이크", "웹캠", "외장하드", "USB", "보조배터리", "충전기",
    "공기청정기", "가습기", "제습기", "전자레인지", "오븐", "식기세척기", "인덕션", "믹서기", "커피머신", "토스터",
    "다리미", "드라이기", "고데기", "전동칫솔", "체중계", "캐리어", "배낭", "파우치", "벨트", "목걸이",
    "반지", "귀걸이", "모자", "목도리", "장갑", "운동화", "구두", "슬리퍼", "패딩", "코트","디올"
  ]
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
