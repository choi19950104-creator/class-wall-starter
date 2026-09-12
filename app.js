import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

// Firebase 콘솔에서 발급받은 웹 앱 설정입니다.
const firebaseConfig = {
  apiKey: "AIzaSyDyqDRnSMVgEZrw9mxKl94zUd8Xif25-k8",
  authDomain: "class-cjh.firebaseapp.com",
  projectId: "class-cjh",
  storageBucket: "class-cjh.firebasestorage.app",
  messagingSenderId: "957588077271",
  appId: "1:957588077271:web:1b7d39a876281f0f5c8e92"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const memosCollection = collection(db, "chating box");

// ===================================================
// 우리 반 담벼락 - 시작점
//
// 메모를 쓰면 올린 순서대로 담벼락에 붙습니다.
// 데이터는 Firestore에 저장되어 새로고침해도 남아 있습니다.
// ===================================================


// ===================================================
// 데이터를 다루는 함수 세 개
// 세 함수 모두 Firestore의 chating box 컬렉션을 사용합니다.
// ===================================================

// 메모를 읽어 옵니다.
async function loadMemos() {
  const memosQuery = query(memosCollection, orderBy("createdAt"));
  const snapshot = await getDocs(memosQuery);

  return snapshot.docs.map(function (memoDoc) {
    return {
      id: memoDoc.id,
      ...memoDoc.data()
    };
  });
}

// 메모를 새로 씁니다.
// 백엔드 2: 여기에 "누가 썼는지"(uid)를 함께 저장하게 됩니다.
async function addMemo(text) {
  await addDoc(memosCollection, {
    text: text,
    createdAt: Date.now()
  });
}

// 메모를 지웁니다.
// 백엔드 2: 지금은 누구든 남의 메모를 지울 수 있습니다. 이걸 막는 것이 과제입니다.
async function deleteMemo(id) {
  await deleteDoc(doc(memosCollection, id));
}


// ===================================================
// 화면 그리기
// ===================================================

async function render() {
  const wall = document.getElementById("wall");
  wall.innerHTML = "";

  const memos = await loadMemos();
  memos.forEach(function (memo) {
    wall.appendChild(makeMemo(memo));
  });
}

// 메모 한 장 만들기
function makeMemo(memo) {
  const div = document.createElement("div");
  div.className = "memo";

  const del = document.createElement("button");
  del.textContent = "×";
  del.addEventListener("click", async function () {
    del.disabled = true;

    try {
      await deleteMemo(memo.id);
      await render();
    } catch (error) {
      console.error("메모를 지우지 못했습니다.", error);
      alert("메모를 지우지 못했습니다. 잠시 후 다시 시도해 주세요.");
      del.disabled = false;
    }
  });
  div.appendChild(del);

  const span = document.createElement("span");
  span.textContent = memo.text;
  div.appendChild(span);

  return div;
}


// ===================================================
// 메모 쓰는 칸
// 엔터를 누르면 담벼락에 붙습니다 (줄바꿈은 Shift + 엔터)
// ===================================================

const input = document.getElementById("input");

input.addEventListener("keydown", async function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();

    const text = input.value.trim();
    if (text === "") return;

    input.disabled = true;

    try {
      await addMemo(text);
      input.value = "";
      await render();
    } catch (error) {
      console.error("메모를 저장하지 못했습니다.", error);
      alert("메모를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      input.disabled = false;
      input.focus();
    }
  }
});


// 첫 화면 그리기
render().catch(function (error) {
  console.error("메모를 불러오지 못했습니다.", error);
  alert("메모를 불러오지 못했습니다. Firebase 설정과 보안 규칙을 확인해 주세요.");
});
input.focus();
