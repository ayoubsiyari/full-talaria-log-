import React from 'react';
import DarkModeToggle from '../components/DarkModeToggle';

export default function DarkModeTest() {
  return (
    <div className="min-h-screen bg-theme-primary p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-theme-primary">Dark Mode Test Page</h1>
          <DarkModeToggle />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Background Colors */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Background Colors</h2>
            
            <div className="bg-theme-primary p-4 rounded-lg border border-theme-primary">
              <p className="text-theme-primary font-medium">Primary Background</p>
              <p className="text-theme-secondary text-sm">This is the main background color</p>
            </div>
            
            <div className="bg-theme-secondary p-4 rounded-lg border border-theme-primary">
              <p className="text-theme-primary font-medium">Secondary Background</p>
              <p className="text-theme-secondary text-sm">This is the secondary background color</p>
            </div>
            
            <div className="bg-theme-tertiary p-4 rounded-lg border border-theme-primary">
              <p className="text-theme-primary font-medium">Tertiary Background</p>
              <p className="text-theme-secondary text-sm">This is the tertiary background color</p>
            </div>
            
            <div className="bg-theme-card p-4 rounded-lg border border-theme-primary">
              <p className="text-theme-primary font-medium">Card Background</p>
              <p className="text-theme-secondary text-sm">This is the card background color</p>
            </div>
          </div>

          {/* Text Colors */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Text Colors</h2>
            
            <div className="bg-theme-card p-4 rounded-lg border border-theme-primary">
              <p className="text-theme-primary font-medium">Primary Text</p>
              <p className="text-theme-secondary">Secondary Text</p>
              <p className="text-theme-muted text-sm">Muted Text</p>
            </div>
            
            <div className="bg-theme-card p-4 rounded-lg border border-theme-primary">
              <p className="status-success">Success Status</p>
              <p className="status-error">Error Status</p>
              <p className="status-warning">Warning Status</p>
              <p className="status-info">Info Status</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Buttons</h2>
            
            <div className="space-y-2">
              <button className="btn-primary">Primary Button</button>
              <button className="btn-secondary">Secondary Button</button>
              <button className="btn-ghost">Ghost Button</button>
            </div>
          </div>

          {/* Cards */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Cards</h2>
            
            <div className="card p-4">
              <h3 className="text-theme-primary font-medium mb-2">Card Title</h3>
              <p className="text-theme-secondary text-sm">This is a card with theme styling</p>
            </div>
            
            <div className="card card-hover p-4 cursor-pointer">
              <h3 className="text-theme-primary font-medium mb-2">Hoverable Card</h3>
              <p className="text-theme-secondary text-sm">This card has hover effects</p>
            </div>
          </div>

          {/* Inputs */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Inputs</h2>
            
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Enter text here..." 
                className="input-theme w-full"
              />
              <input 
                type="email" 
                placeholder="Enter email..." 
                className="input-theme w-full"
              />
            </div>
          </div>

          {/* Tables */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Tables</h2>
            
            <table className="table-theme">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Primary Text</td>
                  <td>text-theme-primary</td>
                </tr>
                <tr>
                  <td>Secondary Text</td>
                  <td>text-theme-secondary</td>
                </tr>
                <tr>
                  <td>Card Background</td>
                  <td>bg-theme-card</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Shadows */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Shadows</h2>
            
            <div className="space-y-4">
              <div className="bg-theme-card p-4 rounded-lg shadow-theme-sm">
                <p className="text-theme-primary">Small Shadow</p>
              </div>
              <div className="bg-theme-card p-4 rounded-lg shadow-theme-md">
                <p className="text-theme-primary">Medium Shadow</p>
              </div>
              <div className="bg-theme-card p-4 rounded-lg shadow-theme-lg">
                <p className="text-theme-primary">Large Shadow</p>
              </div>
              <div className="bg-theme-card p-4 rounded-lg shadow-theme-xl">
                <p className="text-theme-primary">Extra Large Shadow</p>
              </div>
            </div>
          </div>

          {/* Animations */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-theme-primary">Animations</h2>
            
            <div className="space-y-4">
              <div className="bg-theme-card p-4 rounded-lg fade-in">
                <p className="text-theme-primary">Fade In Animation</p>
              </div>
              <div className="bg-theme-card p-4 rounded-lg slide-in">
                <p className="text-theme-primary">Slide In Animation</p>
              </div>
              <div className="bg-theme-card p-4 rounded-lg">
                <div className="loading-skeleton h-4 w-full mb-2"></div>
                <div className="loading-skeleton h-4 w-3/4"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 p-6 bg-theme-card rounded-lg border border-theme-primary">
          <h2 className="text-xl font-semibold text-theme-primary mb-4">Theme Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-theme-secondary mb-2">Current Theme Classes:</p>
              <ul className="text-theme-muted space-y-1">
                <li>• bg-theme-primary</li>
                <li>• bg-theme-secondary</li>
                <li>• bg-theme-tertiary</li>
                <li>• bg-theme-card</li>
                <li>• text-theme-primary</li>
                <li>• text-theme-secondary</li>
                <li>• text-theme-muted</li>
                <li>• border-theme-primary</li>
                <li>• shadow-theme-*</li>
              </ul>
            </div>
            <div>
              <p className="text-theme-secondary mb-2">Utility Classes:</p>
              <ul className="text-theme-muted space-y-1">
                <li>• card</li>
                <li>• card-hover</li>
                <li>• btn-primary</li>
                <li>• btn-secondary</li>
                <li>• btn-ghost</li>
                <li>• input-theme</li>
                <li>• table-theme</li>
                <li>• focus-ring</li>
                <li>• fade-in</li>
                <li>• slide-in</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 