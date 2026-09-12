import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

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
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const memosCollection = collection(db, "chating box");
let currentRole = null;

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

// 처음 로그인한 사용자는 학생으로 등록하고 현재 역할을 읽어 옵니다.
async function loadUserRole(user) {
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await setDoc(userRef, { role: "student" });
    return "student";
  }

  const role = userSnapshot.data().role;
  if (role !== "teacher" && role !== "student") {
    throw new Error("사용자 역할이 올바르지 않습니다.");
  }

  return role;
}

// 메모를 새로 씁니다.
// 로그인한 사용자의 uid를 함께 저장합니다.
async function addMemo(text) {
  const user = auth.currentUser;
  if (!user || !currentRole) {
    throw new Error("로그인과 역할 확인이 필요합니다.");
  }

  await addDoc(memosCollection, {
    text: text,
    createdAt: Date.now(),
    uid: user.uid
  });
}

// 메모를 지웁니다.
// 실제 삭제 권한은 Firestore 보안 규칙에서도 다시 확인합니다.
async function deleteMemo(id) {
  await deleteDoc(doc(memosCollection, id));
}

// 교사가 모든 게시물의 AI 코멘트를 만들고 Firestore에 저장합니다.
async function addAiComments() {
  const user = auth.currentUser;
  if (!user || currentRole !== "teacher") {
    throw new Error("교사만 AI 코멘트를 만들 수 있습니다.");
  }

  const memos = await loadMemos();
  if (memos.length === 0) {
    throw new Error("코멘트를 만들 게시물이 없습니다.");
  }
  if (memos.length > 30) {
    throw new Error("AI 코멘트는 한 번에 게시물 30개까지 만들 수 있습니다.");
  }

  const idToken = await user.getIdToken();
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + idToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      // Gemini에는 uid·이메일 없이 게시물 내용만 보냅니다.
      texts: memos.map(function (memo) { return memo.text; })
    })
  });

  const result = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    throw new Error(result.error || "AI 코멘트를 만들지 못했습니다.");
  }
  if (!Array.isArray(result.comments) || result.comments.length !== memos.length) {
    throw new Error("AI 코멘트 응답 형식이 올바르지 않습니다.");
  }

  const batch = writeBatch(db);
  const commentedAt = Date.now();
  memos.forEach(function (memo, index) {
    const changes = {
      aiComment: result.comments[index],
      aiCommentedAt: commentedAt
    };

    // 로그인 도입 전에 쓴 메모는 교사 소유로 정리합니다.
    if (!memo.uid) changes.uid = user.uid;
    batch.update(doc(memosCollection, memo.id), changes);
  });
  await batch.commit();
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

  // 교사는 모든 메모를, 학생은 자신의 메모만 지울 수 있습니다.
  const canDelete = auth.currentUser
    && (currentRole === "teacher" || memo.uid === auth.currentUser.uid);

  if (canDelete) {
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
  }

  const span = document.createElement("span");
  span.textContent = memo.text;
  div.appendChild(span);

  if (memo.aiComment) {
    const comment = document.createElement("p");
    comment.className = "ai-comment";
    comment.textContent = "AI 코멘트: " + memo.aiComment;
    div.appendChild(comment);
  }

  return div;
}


// ===================================================
// 메모 쓰는 칸
// 엔터를 누르면 담벼락에 붙습니다 (줄바꿈은 Shift + 엔터)
// ===================================================

const input = document.getElementById("input");
const userArea = document.getElementById("userArea");

// 로그인 상태에 맞춰 사용자 영역과 입력 칸을 바꿉니다.
function renderUserArea(user, role) {
  userArea.innerHTML = "";

  if (user) {
    const message = document.createElement("span");
    const roleName = role === "teacher" ? "교사" : "학생";
    message.textContent = (user.displayName || "사용자") + "님 (" + roleName + ") ";
    userArea.appendChild(message);

    const logoutButton = document.createElement("button");
    logoutButton.textContent = "로그아웃";
    logoutButton.addEventListener("click", async function () {
      logoutButton.disabled = true;

      try {
        await signOut(auth);
      } catch (error) {
        console.error("로그아웃하지 못했습니다.", error);
        alert("로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        logoutButton.disabled = false;
      }
    });
    userArea.appendChild(logoutButton);

    if (role === "teacher") {
      const aiButton = document.createElement("button");
      aiButton.textContent = "AI 코멘트 만들기";
      aiButton.addEventListener("click", async function () {
        aiButton.disabled = true;
        aiButton.textContent = "AI 코멘트 작성 중...";

        try {
          await addAiComments();
          await render();
          alert("모든 게시물에 AI 코멘트를 남겼습니다.");
        } catch (error) {
          console.error("AI 코멘트를 만들지 못했습니다.", error);
          alert(error.message);
        } finally {
          aiButton.disabled = false;
          aiButton.textContent = "AI 코멘트 만들기";
        }
      });
      userArea.appendChild(aiButton);
    }

    input.disabled = false;
    input.placeholder = "메모를 쓰고 엔터";
    input.focus();
    return;
  }

  const loginButton = document.createElement("button");
  loginButton.textContent = "Google로 로그인";
  loginButton.addEventListener("click", async function () {
    loginButton.disabled = true;

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Google 로그인에 실패했습니다.", error);

      if (error.code === "auth/unauthorized-domain") {
        alert("Firebase Authentication의 승인된 도메인에 현재 주소를 추가해 주세요.");
      } else if (error.code === "auth/popup-blocked") {
        alert("브라우저에서 로그인 팝업을 허용해 주세요.");
      } else if (error.code !== "auth/popup-closed-by-user") {
        alert("Google 로그인에 실패했습니다. Firebase 인증 설정을 확인해 주세요.");
      }
      loginButton.disabled = false;
    }
  });
  userArea.appendChild(loginButton);

  input.disabled = true;
  input.placeholder = "Google 로그인 후 메모를 쓸 수 있습니다";
}

input.addEventListener("keydown", async function (e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();

    if (!auth.currentUser) {
      alert("먼저 Google로 로그인해 주세요.");
      return;
    }

    const text = input.value.trim();
    if (text === "") return;
    if (Array.from(text).length < 5) {
      alert("메모는 5글자 이상 입력해 주세요.");
      return;
    }

    input.disabled = true;

    try {
      await addMemo(text);
      input.value = "";
      await render();
    } catch (error) {
      console.error("메모를 저장하지 못했습니다.", error);
      alert("메모를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      input.disabled = !auth.currentUser;
      if (auth.currentUser) input.focus();
    }
  }
});


// 로그인 상태가 정해지면 사용자 영역과 첫 화면을 그립니다.
onAuthStateChanged(auth, async function (user) {
  currentRole = null;

  if (!user) {
    renderUserArea(null, null);
    document.getElementById("wall").innerHTML = "";
    return;
  }

  userArea.textContent = "사용자 권한을 확인하고 있습니다.";
  input.disabled = true;

  try {
    currentRole = await loadUserRole(user);
    renderUserArea(user, currentRole);
    await render();
  } catch (error) {
    console.error("사용자 권한 또는 메모를 불러오지 못했습니다.", error);
    userArea.textContent = "사용자 권한을 확인하지 못했습니다.";
    alert("사용자 권한을 확인하지 못했습니다. Firestore 설정을 확인해 주세요.");
  }
});
