import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import './ServiceDirectory.css';

type Props = React.ComponentProps<typeof Link> & {
  icon: LucideIcon;
  title: string;
  description: string;
  status?: string;
};

export const ServiceNavigationCard:React.FC<Props> = ({icon:Icon,title,description,status,className='',...link}) => (
  <Link {...link} className={'vvd-service-navigation '+className}>
    <span className="vvd-service-navigation-icon"><Icon size={21} strokeWidth={1.8}/></span>
    <span className="vvd-service-navigation-copy">
      <span className="vvd-service-navigation-title">{title}</span>
      <span className="vvd-service-navigation-description">{description}</span>
      {status&&<span className="vvd-service-navigation-status">{status}</span>}
    </span>
    <ChevronRight size={17} className="vvd-service-navigation-arrow"/>
  </Link>
);
