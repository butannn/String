import { AuthProvider } from "@/context/auth-context";
import { AppRouter } from "@/router";

function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}

export default App;
