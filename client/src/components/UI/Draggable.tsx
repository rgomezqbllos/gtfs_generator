import React, { useState, useEffect } from 'react';

interface DraggableProps {
    children: React.ReactNode;
    className?: string; // Classes for the wrapper div
    handleClass?: string; // Class name of the element that acts as the drag handle
}

const Draggable: React.FC<DraggableProps> = ({ children, className = '', handleClass = 'drag-handle' }) => {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // Mouse position at start
    const [initialPos, setInitialPos] = useState({ x: 0, y: 0 }); // Element position at start (translate)

    const onMouseDown = (e: React.MouseEvent) => {
        // Only allow dragging if clicking on the handle
        if (handleClass && !(e.target as HTMLElement).closest(`.${handleClass}`)) {
            return;
        }

        if (e.button !== 0) return; // Only left click

        e.preventDefault();

        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialPos({ ...position });
    };

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;

            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            setPosition({
                x: initialPos.x + dx,
                y: initialPos.y + dy
            });
        };

        const onMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        }

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, dragStart, initialPos]);

    return (
        <div
            className={`${className} transition-transform duration-0`} // duration-0 to instant update while dragging
            style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
            onMouseDown={onMouseDown}
        >
            {children}
        </div>
    );
};

export default Draggable;
