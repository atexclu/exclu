import React from 'react';
import './StarBorder.css';

type StarBorderProps<T extends React.ElementType = 'button'> = {
  as?: T;
  className?: string;
  color?: string;
  color1?: string;
  color2?: string;
  speed?: string;
  thickness?: number;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'className' | 'color' | 'children'>;

const StarBorder = <T extends React.ElementType = 'button'>({
  as,
  className = '',
  color,
  color1,
  color2,
  speed = '5s',
  thickness = 1,
  children,
  style,
  ...rest
}: StarBorderProps<T>) => {
  const Component = as || 'button';
  const topColor = color1 || color || 'white';
  const bottomColor = color2 || color || 'white';
  return (
    <Component
      className={`star-border-container ${className}`}
      style={{ padding: `${thickness}px 0`, ...style }}
      {...rest}
    >
      <div
        className="border-gradient-bottom"
        style={{
          background: `radial-gradient(circle, ${bottomColor}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div
        className="border-gradient-top"
        style={{
          background: `radial-gradient(circle, ${topColor}, transparent 10%)`,
          animationDuration: speed,
        }}
      />
      <div className="inner-content">{children}</div>
    </Component>
  );
};

export default StarBorder;
