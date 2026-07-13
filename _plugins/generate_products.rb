# _plugins/generate_products.rb
require 'json'

module Jekyll
  class ProductPageGenerator < Generator
    safe true
    priority :high

    def generate(site)
      # Читаем catalog.json
      catalog_path = File.join(site.source, 'catalog.json')
      
      unless File.exist?(catalog_path)
        Jekyll.logger.warn "ProductPageGenerator:", "catalog.json not found!"
        return
      end

      begin
        catalog_data = JSON.parse(File.read(catalog_path))
        products = catalog_data['products']
        
        # Проверяем, есть ли товары
        if products.nil? || products.empty?
          Jekyll.logger.warn "ProductPageGenerator:", "No products found in catalog.json"
          return
        end

        Jekyll.logger.info "ProductPageGenerator:", "Generating pages for #{products.count} products"

        products.each do |product|
          # Пропускаем товары без ID
          next if product['id'].nil? || product['id'].empty?
          
          # Создаём документ для каждого товара
          site.pages << ProductPage.new(site, site.source, product)
        end

      rescue JSON::ParserError => e
        Jekyll.logger.error "ProductPageGenerator:", "Error parsing catalog.json: #{e.message}"
      rescue => e
        Jekyll.logger.error "ProductPageGenerator:", "Unexpected error: #{e.message}"
      end
    end
  end

  class ProductPage < Page
    def initialize(site, base, product_data)
      @site = site
      @base = base
      @dir  = product_data['id']  # Создаём папку с ID товара
      @name = 'index.html'        # Имя файла

      # Читаем шаблон
      layout_path = File.join(base, '_layouts', 'product.html')
      unless File.exist?(layout_path)
        Jekyll.logger.error "ProductPage:", "Layout _layouts/product.html not found!"
        return
      end

      self.process(@name)
      self.read_yaml(File.join(base, '_layouts'), 'product.html')
      
      # Заполняем данными
      self.data['title'] = product_data['name']
      self.data['name'] = product_data['name']
      self.data['price'] = product_data['price']
      self.data['image'] = product_data['image']
      self.data['description'] = product_data['description']
      self.data['warranty'] = product_data['warranty']
      self.data['categories'] = product_data['categories']
      
      # Мета-теги для SEO
      self.data['meta_title'] = "#{product_data['name']} | #{product_data['price']} | Electra Georgia"
      self.data['meta_description'] = product_data['description']
      self.data['meta_image'] = product_data['image']
      
      # Добавляем похожие товары (берём случайные 3 товара)
      all_products = site.data['catalog'] || []
      similar = all_products
        .reject { |p| p['id'] == product_data['id'] }
        .sample(3)
      self.data['related_products'] = similar if similar.any?

      Jekyll.logger.debug "ProductPage:", "Created page for #{product_data['name']} at /#{@dir}/"
    end
  end
end
