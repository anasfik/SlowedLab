/**
 * Helmet-like component for managing document head meta tags and SEO
 * Used to dynamically update meta tags for better SEO
 */

interface MetaTagProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  canonicalUrl?: string;
  twitterCard?: string;
}

export const useMetaTags = (props: MetaTagProps) => {
  const {
    title,
    description,
    keywords,
    ogImage,
    ogTitle,
    ogDescription,
    canonicalUrl = 'https://slowedlab.com',
    twitterCard = 'summary_large_image',
  } = props;

  React.useEffect(() => {
    // Update title
    if (title) {
      document.title = title;
    }

    // Update description meta tag
    if (description) {
      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', description);
    }

    // Update keywords meta tag
    if (keywords) {
      let metaKeywords = document.querySelector('meta[name="keywords"]');
      if (!metaKeywords) {
        metaKeywords = document.createElement('meta');
        metaKeywords.setAttribute('name', 'keywords');
        document.head.appendChild(metaKeywords);
      }
      metaKeywords.setAttribute('content', keywords);
    }

    // Update Open Graph tags
    if (ogTitle) {
      let ogTitleTag = document.querySelector('meta[property="og:title"]');
      if (!ogTitleTag) {
        ogTitleTag = document.createElement('meta');
        ogTitleTag.setAttribute('property', 'og:title');
        document.head.appendChild(ogTitleTag);
      }
      ogTitleTag.setAttribute('content', ogTitle);
    }

    if (ogDescription) {
      let ogDescTag = document.querySelector('meta[property="og:description"]');
      if (!ogDescTag) {
        ogDescTag = document.createElement('meta');
        ogDescTag.setAttribute('property', 'og:description');
        document.head.appendChild(ogDescTag);
      }
      ogDescTag.setAttribute('content', ogDescription);
    }

    if (ogImage) {
      let ogImageTag = document.querySelector('meta[property="og:image"]');
      if (!ogImageTag) {
        ogImageTag = document.createElement('meta');
        ogImageTag.setAttribute('property', 'og:image');
        document.head.appendChild(ogImageTag);
      }
      ogImageTag.setAttribute('content', ogImage);
    }

    // Update canonical URL
    if (canonicalUrl) {
      let canonical = document.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);
    }

    // Update Twitter Card
    if (twitterCard) {
      let twitterCardTag = document.querySelector('meta[name="twitter:card"]');
      if (!twitterCardTag) {
        twitterCardTag = document.createElement('meta');
        twitterCardTag.setAttribute('name', 'twitter:card');
        document.head.appendChild(twitterCardTag);
      }
      twitterCardTag.setAttribute('content', twitterCard);
    }
  }, [title, description, keywords, ogImage, ogTitle, ogDescription, canonicalUrl, twitterCard]);
};

// Export as a component for convenience
import React from 'react';

export const MetaTags: React.FC<MetaTagProps> = (props) => {
  useMetaTags(props);
  return null;
};

export default MetaTags;
