import {
  Navigate,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { useAuth } from "@/context/auth-context";
import { LoginPage } from "@/pages/login-page";
import { AppPage } from "@/pages/app-page";

type AuthContext = ReturnType<typeof useAuth>;

type RouterContext = {
  auth: AuthContext;
};

const RootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
    </>
  ),
});

const IndexRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/",
  component: () => {
    const auth = useAuth();

    if (auth.isLoading) {
      return (
        <div className="grid min-h-screen place-items-center">Loading...</div>
      );
    }

    if (auth.user) {
      return <Navigate to="/app" />;
    }

    return <Navigate to="/login" />;
  },
});

const LoginRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/login",
  component: LoginPage,
});

const AppRoute = createRoute({
  getParentRoute: () => RootRoute,
  path: "/app",
  component: AppPage,
});

const routeTree = RootRoute.addChildren([IndexRoute, LoginRoute, AppRoute]);

const router = createRouter({
  routeTree,
  context: {
    auth: undefined as unknown as AuthContext,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  const auth = useAuth();

  return <RouterProvider router={router} context={{ auth }} />;
}
