import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD9wT1t_Fkc0udZywXBlHhAvya06jArMgo",
  authDomain: "mccv-a64a1.firebaseapp.com",
  projectId: "mccv-a64a1",
  storageBucket: "mccv-a64a1.firebasestorage.app",
  messagingSenderId: "815811481712",
  appId: "1:815811481712:web:58577f626039d31a81e4b5"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

try {
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    "stephanec@mccv.local",
    "Stephane1!"
  );
  const uid = userCredential.user.uid;
  await setDoc(doc(db, "users", uid), {
    actif: true,
    dateCreation: new Date().toISOString(),
    email: "stephanec@mccv.local",
    login: "StéphaneC",
    nom: "Stéphane",
    password: "Stephane1!",
    role: "user",
    setupDone: false
  });
  console.log("✅ Compte StéphaneC créé ! UID:", uid);
} catch(e) {
  console.log("❌ Erreur:", e.message);
}
process.exit(0);
