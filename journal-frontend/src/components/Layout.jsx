import React from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import { SidebarProvider } from '../context/SidebarContext';
import { useSidebar } from '../context/SidebarContext';

export default function Layout({ children }) {
  const { isCollapsed } = useSidebar();

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-[#0a0a0f] text-white">
        {/* 1. Sidebar */}
        <Sidebar />

        {/* 2. Main area: Navbar + content */}
        <div className={`flex flex-col flex-1 overflow-y-auto transition-all duration-500 ease-out ${isCollapsed ? 'ml-16' : 'ml-64'}`}>
          {/* 2a. Top Navbar */}
          <Navbar />

          {/* 2b. Page content */}
          <main className="flex-1 p-6 bg-[#0a0a0f] overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

