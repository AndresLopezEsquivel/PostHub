import { Outlet } from 'react-router';

import { NavBar } from './NavBar';

// The layout route every screen renders inside, so the nav is added once.
export function RootLayout() {
  return (
    <>
      <NavBar />
      <main>
        <Outlet />
      </main>
    </>
  );
}
