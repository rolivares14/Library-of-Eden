import { createBrowserRouter } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { HomePage } from "./pages/HomePage";
import { BookDetailPage } from "./pages/BookDetailPage";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { PirateIslePage } from "./pages/PirateIslePage";
import { PirateBookDetailPage } from "./pages/PirateBookDetailPage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      {
        index: true,
        Component: HomePage,
      },
      {
        path: "book/:id",
        Component: BookDetailPage,
      },
      {
        path: "pirate",
        Component: PirateIslePage,
      },
      {
        path: "pirate/book/:id",
        Component: PirateBookDetailPage,
      },
    ],
  },
  {
    path: "read/:id",
    lazy: async () => {
      const { EpubReaderPage } = await import("./pages/EpubReaderPage");
      return { Component: EpubReaderPage };
    },
  },
  {
    path: "pirate/read/:id",
    lazy: async () => {
      const { PirateReaderPage } = await import("./pages/PirateReaderPage");
      return { Component: PirateReaderPage };
    },
  },
  {
    path: "signin",
    Component: SignInPage,
  },
  {
    path: "signup",
    Component: SignUpPage,
  },
]);
