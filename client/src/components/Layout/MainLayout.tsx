import React from 'react';
import Sidebar from './Sidebar';

interface MainLayoutProps {
    children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 transition-colors duration-300">
            <Sidebar />
            <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
                {children}
            </main>
        </div>
    );
}
